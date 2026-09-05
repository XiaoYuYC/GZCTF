using System;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using GZCTF.Models;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using NPOI.XSSF.UserModel;
using Xunit;

namespace GZCTF.Test.UnitTests.Cyctf;

public sealed class RegistrationRepositoryTests : IAsyncLifetime
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private AppDbContext _context = null!;
    private CyctfConfigStore _store = null!;
    private RegistrationRepository _repository = null!;

    public async Task InitializeAsync()
    {
        await _connection.OpenAsync();
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite(_connection)
            .Options;
        _context = new AppDbContext(options);
        await _context.Database.EnsureCreatedAsync();
        _store = new CyctfConfigStore(_context);
        _repository = new RegistrationRepository(_context, _store);
    }

    public async Task DisposeAsync()
    {
        await _context.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task CreateRegistration_ArchivesReleasedRecordForSameEmail()
    {
        var first = await _repository.CreateRegistration(NewRegistration("captain@example.com"));
        await _repository.UpdateRegistrationStatus(first.Id, "CANCELLED", null, null);

        var second = await _repository.CreateRegistration(NewRegistration("CAPTAIN@example.com"));

        Assert.NotEqual(first.Id, second.Id);
        Assert.Equal(second.Id,
            (await _repository.GetRegistrationByEmailAndGame("captain@example.com", 1))?.Id);
        var records = await _repository.GetRegistrationsByGameIdIncludingDeleted(1);
        Assert.Contains(records, item => item.Id == first.Id && item.Status == "CANCELLED");
        Assert.Contains(records, item => item.Id == second.Id && item.Status == "PENDING");
    }

    [Fact]
    public async Task UpdateRegistrationStatus_MigratesEmailKeyToTeamKey()
    {
        var registration = await _repository.CreateRegistration(NewRegistration("captain@example.com"));
        registration.TeamId = 42;

        await _repository.UpdateRegistrationStatus(registration, "APPROVED", null, null);

        Assert.Null(await _store.Get<Registration>("CYCTF:Registration:1:email:captain@example.com"));
        var stored = await _store.Get<Registration>("CYCTF:Registration:1:42");
        Assert.Equal(registration.Id, stored?.Id);
        Assert.Equal("APPROVED", stored?.Status);
        Assert.Equal(42, stored?.TeamId);
    }

    [Fact]
    public async Task UpdateRegistrationStatus_MigratesReleasedResourcesBackToEmailKey()
    {
        var registration = await _repository.CreateRegistration(NewRegistration("captain@example.com"));
        var provisionedUserId = Guid.NewGuid();
        registration.TeamId = 42;
        registration.ProvisionedTeamId = 42;
        registration.ProvisionedUserIds = [provisionedUserId];
        await _repository.UpdateRegistrationStatus(registration, "APPROVED", null, null);

        registration.TeamId = null;
        registration.ProvisionedTeamId = null;
        registration.ProvisionedUserIds = [];
        await _repository.UpdateRegistrationStatus(registration, "REJECTED", "cleanup", null);

        Assert.Null(await _store.Get<Registration>("CYCTF:Registration:1:42"));
        var stored = await _store.Get<Registration>("CYCTF:Registration:1:email:captain@example.com");
        Assert.Equal(registration.Id, stored?.Id);
        Assert.Equal("REJECTED", stored?.Status);
        Assert.Null(stored?.TeamId);
        Assert.Null(stored?.ProvisionedTeamId);
        Assert.Empty(stored?.ProvisionedUserIds ?? []);
    }

    [Fact]
    public async Task UpdatingArchivedRegistration_DoesNotOverwriteCurrentEmailRegistration()
    {
        var first = await _repository.CreateRegistration(NewRegistration("captain@example.com"));
        await _repository.UpdateRegistrationStatus(first.Id, "CANCELLED", null, null);
        var second = await _repository.CreateRegistration(NewRegistration("captain@example.com"));

        await _repository.UpdateRegistrationStatus(first.Id, "REJECTED", "old record", null);

        var current = await _store.Get<Registration>("CYCTF:Registration:1:email:captain@example.com");
        Assert.Equal(second.Id, current?.Id);
        Assert.Equal("PENDING", current?.Status);
        var archived = await _store.Get<Registration>("CYCTF:Registration:1:history:1");
        Assert.Equal("REJECTED", archived?.Status);
        Assert.Equal("old record", archived?.ReviewNote);
    }

    [Fact]
    public async Task UpdateRegistrationStatus_PreservesReviewNoteWhenStatusChangeReceivesExistingNote()
    {
        var registration = await _repository.CreateRegistration(NewRegistration("captain@example.com"));
        registration.ReviewNote = "独立保存的备注";
        await _repository.UpdateRegistration(registration);

        await _repository.UpdateRegistrationStatus(registration.Id, "CANCELLED", registration.ReviewNote, null);

        var stored = await _repository.GetRegistrationById(registration.Id);
        Assert.Equal("CANCELLED", stored?.Status);
        Assert.Equal("独立保存的备注", stored?.ReviewNote);
    }

    [Fact]
    public async Task ExportCsv_IncludesCompleteRegistrationDataAndChineseStatuses()
    {
        var game = new Game { Id = 1, Title = "Export Game", PublicKey = "public", PrivateKey = "private" };
        var captain = new UserInfo
        {
            Id = Guid.NewGuid(),
            UserName = "captain-user",
            Email = "captain@example.com",
            RealName = "队长姓名",
            StdNumber = "CAP-001",
            PhoneNumber = "13800000000",
            Bio = "队长简介"
        };
        var member = new UserInfo
        {
            Id = Guid.NewGuid(),
            UserName = "member-user",
            Email = "member@example.com",
            RealName = "队员姓名",
            StdNumber = "MEM-001",
            PhoneNumber = "13900000000",
            Bio = "队员简介"
        };
        var team = new Team { Id = 12, Name = "完整队伍", Bio = "队伍简介", Captain = captain, CaptainId = captain.Id, Locked = true };
        team.Members.Add(captain);
        team.Members.Add(member);
        var division = new Division { Id = 1, GameId = 1, Name = "本科组" };
        var emptyDivision = new Division { Id = 2, GameId = 1, Name = "研究生组" };
        _context.Games.Add(game);
        _context.Users.AddRange(captain, member);
        _context.Teams.Add(team);
        _context.Divisions.AddRange(division, emptyDivision);
        await _context.SaveChangesAsync();
        await _store.Set("CYCTF:DivisionExtension:1", new DivisionExtension
        {
            DivisionId = 1,
            RegistrationFields = "[{\"name\":\"school\",\"label\":\"学校\",\"scope\":\"team\"},{\"name\":\"grade\",\"label\":\"年级\",\"scope\":\"member\"}]"
        });

        var registration = new Registration
        {
            GameId = 1,
            DivisionId = 1,
            TeamId = 12,
            TeamName = "完整队伍",
            TeamBio = "队伍简介",
            Team = team,
            Division = division,
            Status = "APPROVED",
            CaptainEmail = "captain@example.com",
            FormData = "{\"school\":\"某大学,主校区\",\"extra\":\"line1\\nline2\"}",
            MemberInvitations = JsonSerializer.Serialize(new[]
            {
                new MemberInvitation
                {
                    Email = "member@example.com",
                    Status = InvitationStatus.Accepted,
                    MemberFields = "{\"grade\":\"大三\",\"hobby\":\"PWN\"}",
                    SentAt = DateTimeOffset.UtcNow
                }
            })
        };
        await _repository.CreateRegistration(registration);

        var csv = Encoding.UTF8.GetString(await _repository.ExportCsv(1, null));

        var csvHeader = csv.TrimStart('\uFEFF').Split('\n', 2)[0].TrimEnd('\r');
        Assert.Equal(
            "队伍名,学校,队长年级,队员1年级,报名状态,审核备注,审核人,报名时间,审核时间,更新时间",
            csvHeader);
        Assert.Contains("已通过", csv);
        Assert.Contains("某大学,主校区", csv);
        Assert.Contains("大三", csv);
        Assert.DoesNotContain("line1", csv);
        Assert.DoesNotContain("hobby", csv);
        Assert.DoesNotContain("队伍字段:", csv);
        Assert.DoesNotContain("报名字段:", csv);
        Assert.DoesNotContain("队员字段:", csv);
        Assert.DoesNotContain("队长字段:", csv);
        Assert.DoesNotContain("队长账号", csv);
        Assert.DoesNotContain("邀请状态", csv);
        Assert.DoesNotContain("报名表单原始数据", csv);

        var excelZip = await _repository.ExportExcelZip(1, null);
        using var archive = new ZipArchive(new MemoryStream(excelZip), ZipArchiveMode.Read);
        var workbookEntry = Assert.Single(archive.Entries, entry => entry.Name.Contains("本科组", StringComparison.Ordinal));
        Assert.EndsWith(".xlsx", workbookEntry.Name, StringComparison.OrdinalIgnoreCase);
        using var workbookStream = workbookEntry.Open();
        var workbook = new XSSFWorkbook(workbookStream);
        var headerRow = workbook.GetSheetAt(0).GetRow(0);
        var headers = Enumerable.Range(0, headerRow.LastCellNum)
            .Select(index => headerRow.GetCell(index).StringCellValue)
            .ToArray();
        Assert.Equal(
            new[] { "队伍名", "学校", "队长年级", "队员1年级", "报名状态", "审核备注", "审核人", "报名时间", "审核时间", "更新时间" },
            headers);
        Assert.DoesNotContain(headers, header => header.Contains("字段:", StringComparison.Ordinal));
        Assert.DoesNotContain(headers, header => header.Contains("账号", StringComparison.Ordinal));
        Assert.DoesNotContain(headers, header => header.Contains("邀请", StringComparison.Ordinal));

        var workbookEntries = archive.Entries.Where(entry => entry.Name.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase)).ToArray();
        Assert.Equal(2, workbookEntries.Length);
        Assert.Contains(workbookEntries, entry => entry.Name.Contains("研究生组", StringComparison.Ordinal));
    }

    [Fact]
    public async Task DeleteRegistration_RemovesAllReadableCopies()
    {
        var registration = await _repository.CreateRegistration(NewRegistration("captain@example.com"));
        await _store.Set("CYCTF:Registration:1:legacy-copy", new Registration
        {
            Id = registration.Id,
            GameId = registration.GameId,
            DivisionId = registration.DivisionId,
            CaptainEmail = registration.CaptainEmail,
            Status = "APPROVED",
            CreateTime = registration.CreateTime,
            UpdateTime = registration.UpdateTime.AddMinutes(-1)
        });

        Assert.True(await _repository.DeleteRegistration(registration.Id));

        Assert.Null(await _repository.GetRegistrationById(registration.Id));
        Assert.DoesNotContain(await _repository.GetRegistrationsByGameId(1),
            item => item.Id == registration.Id);
        var copies = await _store.GetByPrefix<Registration>("CYCTF:Registration:1:");
        var deleted = Assert.Single(copies, item => item.Value.Id == registration.Id);
        Assert.True(deleted.Value.Deleted);
    }

    private static Registration NewRegistration(string email) => new()
    {
        GameId = 1,
        DivisionId = 1,
        CaptainEmail = email,
        TeamName = $"team-{Guid.NewGuid():N}"[..20],
        Status = "PENDING"
    };
}
