using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using GZCTF.Controllers.Cyctf;
using GZCTF.Models;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Models.Request.Info;
using GZCTF.Repositories;
using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace GZCTF.Test.UnitTests.Cyctf;

public sealed class RegistrationResourceCleanupTests : IAsyncLifetime
{
    private readonly SqliteConnection _connection = new("Data Source=:memory:");
    private ServiceProvider _serviceProvider = null!;
    private AsyncServiceScope _scope;
    private AppDbContext _context = null!;
    private UserManager<UserInfo> _userManager = null!;
    private TeamRepository _teamRepository = null!;
    private RegistrationController _controller = null!;

    public async Task InitializeAsync()
    {
        await _connection.OpenAsync();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDbContext<AppDbContext>(options => options.UseSqlite(_connection));
        services.AddIdentityCore<UserInfo>()
            .AddRoles<IdentityRole<Guid>>()
            .AddEntityFrameworkStores<AppDbContext>();

        _serviceProvider = services.BuildServiceProvider();
        _scope = _serviceProvider.CreateAsyncScope();
        _context = _scope.ServiceProvider.GetRequiredService<AppDbContext>();
        _userManager = _scope.ServiceProvider.GetRequiredService<UserManager<UserInfo>>();
        _teamRepository = new TeamRepository(_context);
        await _context.Database.EnsureCreatedAsync();

        _controller = new RegistrationController(
            _context,
            null!,
            null!,
            null!,
            null!,
            null!,
            null!,
            _teamRepository,
            _userManager,
            null!,
            null!,
            null!,
            null!,
            NullLogger<RegistrationController>.Instance,
            null!);
    }

    public async Task DisposeAsync()
    {
        await _scope.DisposeAsync();
        await _serviceProvider.DisposeAsync();
        await _connection.DisposeAsync();
    }

    [Fact]
    public async Task ReleaseRegistrationResources_DeletesTrackedCaptainAndTeamButKeepsExistingMember()
    {
        var provisionedCaptain = await CreateUser("newcap");
        var existingMember = await CreateUser("existing");
        var team = await CreateTeam(provisionedCaptain, existingMember);
        var registration = NewApprovedRegistration(team, provisionedCaptain.Id);

        await _controller.ReleaseRegistrationResources(registration, CancellationToken.None);
        _context.ChangeTracker.Clear();

        Assert.Null(await _context.Teams.FindAsync(team.Id));
        Assert.Null(await _userManager.FindByIdAsync(provisionedCaptain.Id.ToString()));
        Assert.NotNull(await _userManager.FindByIdAsync(existingMember.Id.ToString()));
        Assert.Null(registration.TeamId);
        Assert.Null(registration.ProvisionedTeamId);
        Assert.Empty(registration.ProvisionedUserIds);
    }

    [Fact]
    public async Task ReleaseRegistrationResources_DeletesTrackedMemberButKeepsExistingCaptain()
    {
        var existingCaptain = await CreateUser("existingcap");
        var provisionedMember = await CreateUser("newmember");
        var team = await CreateTeam(existingCaptain, provisionedMember);
        var registration = NewApprovedRegistration(team, provisionedMember.Id);

        await _controller.ReleaseRegistrationResources(registration, CancellationToken.None);
        _context.ChangeTracker.Clear();

        Assert.Null(await _context.Teams.FindAsync(team.Id));
        Assert.NotNull(await _userManager.FindByIdAsync(existingCaptain.Id.ToString()));
        Assert.Null(await _userManager.FindByIdAsync(provisionedMember.Id.ToString()));
    }

    [Fact]
    public async Task ReleaseRegistrationResources_StopsBeforeDeletionWhenTrackedAccountUsesAnotherTeam()
    {
        var provisionedCaptain = await CreateUser("shared");
        var otherCaptain = await CreateUser("othercap");
        var registrationTeam = await CreateTeam(provisionedCaptain);
        var otherTeam = await CreateTeam(otherCaptain, provisionedCaptain);
        var registration = NewApprovedRegistration(registrationTeam, provisionedCaptain.Id);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            _controller.ReleaseRegistrationResources(registration, CancellationToken.None));
        _context.ChangeTracker.Clear();

        Assert.Contains("其他队伍", exception.Message);
        Assert.NotNull(await _context.Teams.FindAsync(registrationTeam.Id));
        Assert.NotNull(await _context.Teams.FindAsync(otherTeam.Id));
        Assert.NotNull(await _userManager.FindByIdAsync(provisionedCaptain.Id.ToString()));
        Assert.Equal(registrationTeam.Id, registration.TeamId);
        Assert.Equal(registrationTeam.Id, registration.ProvisionedTeamId);
    }

    private async Task<UserInfo> CreateUser(string prefix)
    {
        var suffix = Guid.NewGuid().ToString("N")[..6];
        var user = new UserInfo
        {
            UserName = $"{prefix}{suffix}"[..Math.Min(prefix.Length + suffix.Length, 16)],
            Email = $"{prefix}-{suffix}@example.com",
            EmailConfirmed = true
        };
        var result = await _userManager.CreateAsync(user, "TestPassword123!");
        Assert.True(result.Succeeded, string.Join(", ", result.Errors.Select(error => error.Description)));
        return user;
    }

    private async Task<Team> CreateTeam(UserInfo captain, params UserInfo[] members)
    {
        var name = $"team-{Guid.NewGuid():N}"[..20];
        var team = await _teamRepository.CreateTeam(new TeamUpdateModel { Name = name }, captain);
        foreach (var member in members)
            team.Members.Add(member);
        await _context.SaveChangesAsync();
        return team;
    }

    private static Registration NewApprovedRegistration(Team team, params Guid[] provisionedUserIds) => new()
    {
        Id = 1,
        GameId = 1,
        DivisionId = 1,
        CaptainEmail = team.Captain?.Email ?? "captain@example.com",
        TeamName = team.Name,
        TeamId = team.Id,
        Team = team,
        ProvisionedTeamId = team.Id,
        ProvisionedUserIds = [.. provisionedUserIds],
        Status = "APPROVED"
    };
}
