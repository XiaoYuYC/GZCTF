using System.Text;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Repositories.Interface;
using Microsoft.EntityFrameworkCore;

namespace GZCTF.Repositories;

public class RegistrationRepository(AppDbContext context, CyctfConfigStore store) :
    RepositoryBase(context), IRegistrationRepository
{
    private const string RootPrefix = "CYCTF:Registration:";
    private static string Key(int gameId, int teamId) => $"{RootPrefix}{gameId}:{teamId}";

    public async Task<List<Registration>> GetRegistrationsByGameId(int gameId, string? status = null,
        CancellationToken token = default)
    {
        // 支持多状态筛选，逗号分隔
        var statusList = string.IsNullOrWhiteSpace(status)
            ? null
            : status.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(s => s.ToUpperInvariant())
                    .ToHashSet();

        var registrations = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId && !item.Deleted)
            .Where(item => statusList == null || statusList.Contains(item.Status))
            .OrderByDescending(item => item.CreateTime)
            .ToList();

        await Hydrate(registrations, token);
        return registrations;
    }

    public async Task<Registration?> GetRegistrationByTeamAndGame(int teamId, int gameId,
        CancellationToken token = default)
    {
        var registration = await store.Get<Registration>(Key(gameId, teamId), token);
        if (registration is null || registration.Deleted)
            return null;

        await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> GetActiveRegistrationByCaptainAndGame(Guid captainId, int gameId,
        CancellationToken token = default)
    {
        var captainTeamIds = await Context.Teams
            .Where(team => team.CaptainId == captainId)
            .Select(team => team.Id)
            .ToHashSetAsync(token);
        if (captainTeamIds.Count == 0)
            return null;

        var registration = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId && !item.Deleted &&
                           item.Status is not ("CANCELLED" or "REJECTED") &&
                           item.TeamId.HasValue && captainTeamIds.Contains(item.TeamId.Value))
            .OrderByDescending(item => item.UpdateTime)
            .FirstOrDefault();

        if (registration is not null)
            await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> GetRegistrationByEmailAndGame(string email, int gameId,
        CancellationToken token = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var registration = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId && !item.Deleted &&
                           item.CaptainEmail != null &&
                           item.CaptainEmail.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(item => item.UpdateTime)
            .FirstOrDefault();

        if (registration is not null)
            await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> GetRegistrationById(int id, CancellationToken token = default)
    {
        var registrations = await store.GetByPrefix<Registration>(RootPrefix, token);
        var registration = registrations.Select(item => item.Value)
            .FirstOrDefault(item => item.Id == id && !item.Deleted);
        if (registration is not null)
            await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration> CreateRegistration(Registration registration,
        CancellationToken token = default)
    {
        // 无需登录报名没有 TeamId，使用 Email + GameId 作为键
        var key = registration.TeamId.HasValue
            ? Key(registration.GameId, registration.TeamId.Value)
            : $"{RootPrefix}{registration.GameId}:email:{registration.CaptainEmail}";

        var existing = await store.Get<Registration>(key, token);
        registration.Id = existing?.Id ?? await store.NextId(RootPrefix, token);
        registration.CreateTime = existing?.CreateTime ?? DateTimeOffset.UtcNow;
        registration.UpdateTime = DateTimeOffset.UtcNow;
        registration.Deleted = false;
        await store.Set(key, registration, token);
        await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> UpdateRegistrationStatus(int id, string status, string? reviewNote,
        Guid? reviewedBy, CancellationToken token = default)
    {
        var registration = await GetRegistrationById(id, token);
        if (registration is null)
            return null;

        registration.Status = status.ToUpperInvariant();
        registration.ReviewNote = reviewNote;
        registration.ReviewedBy = reviewedBy;
        registration.ReviewedAt = DateTimeOffset.UtcNow;
        registration.UpdateTime = registration.ReviewedAt.Value;

        var key = registration.TeamId.HasValue
            ? Key(registration.GameId, registration.TeamId.Value)
            : $"{RootPrefix}{registration.GameId}:email:{registration.CaptainEmail}";

        await store.Set(key, registration, token);
        return registration;
    }

    public async Task<bool> HasRegistration(int teamId, int gameId, CancellationToken token = default) =>
        await GetRegistrationByTeamAndGame(teamId, gameId, token) is { Status: not "CANCELLED" };

    public async Task<Dictionary<string, int>> GetRegistrationStats(int gameId,
        CancellationToken token = default)
    {
        var registrations = await GetRegistrationsByGameId(gameId, token: token);
        return registrations.GroupBy(item => item.Status)
            .ToDictionary(group => group.Key, group => group.Count());
    }

    public async Task<byte[]> ExportCsv(int? gameId, string? status, CancellationToken token = default)
    {
        var registrations = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => !item.Deleted)
            .Where(item => gameId is null || item.GameId == gameId)
            .Where(item => string.IsNullOrWhiteSpace(status) ||
                           item.Status == status!.Trim().ToUpperInvariant())
            .OrderByDescending(item => item.CreateTime)
            .ToList();
        await Hydrate(registrations, token);

        var csv = new StringBuilder("\uFEFF报名ID,比赛ID,队伍ID,队伍名称,队长邮箱,成员,组别ID,组别,状态,审核备注,审核人,审核时间,报名时间\n");
        foreach (var registration in registrations)
        {
            var teamId = registration.TeamId?.ToString() ?? string.Empty;
            var teamName = registration.Team?.Name ?? string.Empty;
            var members = registration.Team != null
                ? string.Join("; ", registration.Team.Members
                    .Select(member => string.IsNullOrWhiteSpace(member.Email)
                        ? member.UserName
                        : $"{member.UserName} <{member.Email}>"))
                : string.Empty;
            var captainEmail = registration.CaptainEmail ?? string.Empty;

            csv.AppendLine(string.Join(',',
                Escape(registration.Id), Escape(registration.GameId), Escape(teamId),
                Escape(teamName), Escape(captainEmail), Escape(members), Escape(registration.DivisionId),
                Escape(registration.Division.Name), Escape(registration.Status), Escape(registration.ReviewNote),
                Escape(registration.Reviewer?.UserName), Escape(registration.ReviewedAt),
                Escape(registration.CreateTime)));
        }

        return Encoding.UTF8.GetBytes(csv.ToString());
    }

    public async Task<bool> DeleteRegistration(int id, CancellationToken token = default)
    {
        var registration = await GetRegistrationById(id, token);
        if (registration is null)
            return false;

        registration.Deleted = true;
        registration.UpdateTime = DateTimeOffset.UtcNow;

        var key = registration.TeamId.HasValue
            ? Key(registration.GameId, registration.TeamId.Value)
            : $"{RootPrefix}{registration.GameId}:email:{registration.CaptainEmail}";

        await store.Set(key, registration, token);
        return true;
    }

    public async Task<bool> IsTeamNameExistsInGame(string teamName, int gameId, CancellationToken token = default)
    {
        var normalizedName = teamName.Trim();
        
        // 1. 检查已创建的队伍（队伍名全局唯一）
        var teamExists = await Context.Teams
            .AnyAsync(t => t.Name == normalizedName, token);
        
        if (teamExists)
            return true;
        
        // 2. 检查同一比赛中待审核报名的队伍名
        var registrations = await store.GetByPrefix<Registration>(RootPrefix, token);
        var pendingWithSameName = registrations
            .Select(item => item.Value)
            .Any(r => r.GameId == gameId && 
                      !r.Deleted && 
                      r.Status == "PENDING" &&
                      !string.IsNullOrWhiteSpace(r.TeamName) &&
                      r.TeamName.Equals(normalizedName, StringComparison.OrdinalIgnoreCase));
        
        return pendingWithSameName;
    }

    public async Task<bool> IsEmailInApprovedRegistration(string email, int gameId, CancellationToken token = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        
        var registrations = await store.GetByPrefix<Registration>(RootPrefix, token);
        var approvedRegistrations = registrations
            .Select(item => item.Value)
            .Where(r => r.GameId == gameId && 
                        !r.Deleted && 
                        r.Status == "APPROVED")
            .ToList();

        foreach (var reg in approvedRegistrations)
        {
            // 检查队长邮箱
            if (reg.CaptainEmail?.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase) == true)
                return true;

            // 检查队员邀请中的邮箱
            if (!string.IsNullOrWhiteSpace(reg.MemberInvitations))
            {
                try
                {
                    var invitations = System.Text.Json.JsonSerializer.Deserialize<List<MemberInvitation>>(reg.MemberInvitations);
                    if (invitations?.Any(inv => inv.Email.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase)) == true)
                        return true;
                }
                catch
                {
                    // JSON 解析失败，跳过
                }
            }
        }

        return false;
    }

    private async Task Hydrate(IEnumerable<Registration> registrations, CancellationToken token)
    {
        foreach (var registration in registrations)
            await Hydrate(registration, token);
    }

    private async Task Hydrate(Registration registration, CancellationToken token)
    {
        registration.Game = await Context.Games.FirstOrDefaultAsync(item => item.Id == registration.GameId, token) ?? null!;
        if (registration.TeamId.HasValue)
        {
            registration.Team = await Context.Teams
                .Include(item => item.Members)
                .FirstOrDefaultAsync(item => item.Id == registration.TeamId.Value, token) ?? null!;
        }
        registration.Division = await Context.Divisions
            .FirstOrDefaultAsync(item => item.Id == registration.DivisionId, token) ?? null!;
        if (registration.ReviewedBy is { } reviewerId)
            registration.Reviewer = await Context.Users.FirstOrDefaultAsync(item => item.Id == reviewerId, token);
    }

    // IDs are allocated from the existing Config keyspace.


    public async Task<Registration?> GetRegistrationByInvitationToken(string token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;

        // 遍历所有报名记录，查找包含该 token 的 MemberInvitations
        var allRegistrations = (await store.GetByPrefix<Registration>(RootPrefix, cancellationToken))
            .Select(item => item.Value)
            .Where(item => !item.Deleted && !string.IsNullOrEmpty(item.MemberInvitations));

        foreach (var registration in allRegistrations)
        {
            try
            {
                var invitations = System.Text.Json.JsonSerializer.Deserialize<List<MemberInvitation>>(registration.MemberInvitations!);
                if (invitations != null && invitations.Any(inv => inv.Token == token))
                {
                    await Hydrate(registration, cancellationToken);
                    return registration;
                }
            }
            catch
            {
                // 解析失败，跳过该记录
            }
        }

        return null;
    }

    public async Task UpdateRegistration(Registration registration, CancellationToken token = default)
    {
        if (registration.TeamId.HasValue)
        {
            await store.Set(Key(registration.GameId, registration.TeamId.Value), registration, token);
        }
        else if (!string.IsNullOrEmpty(registration.CaptainEmail))
        {
            // 无登录报名使用 email 作为 key
            var emailKey = $"{RootPrefix}{registration.GameId}:email:{registration.CaptainEmail}";
            await store.Set(emailKey, registration, token);
        }
    }

    private static string Escape(object? value)
    {
        var text = value?.ToString() ?? string.Empty;
        return text.Contains(',') || text.Contains('"') || text.Contains('\r') || text.Contains('\n')
            ? $"\"{text.Replace("\"", "\"\"")}\""
            : text;
    }
}