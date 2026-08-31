using System;
using System.Linq;
using System.Threading.Tasks;
using GZCTF.Models;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Repositories;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
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
