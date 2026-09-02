using GZCTF.Models.Data.Cyctf;
using System.Text.Json;

namespace GZCTF.Models.Response.Cyctf;

/// <summary>
/// 报名响应
/// </summary>
public class RegistrationResponse
{
    public int Id { get; set; }
    public int GameId { get; set; }
    public int? TeamId { get; set; }
    public string? TeamName { get; set; }
    public string? TeamBio { get; set; }
    public string? CaptainEmail { get; set; }
    public int DivisionId { get; set; }
    public string? DivisionName { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? FormData { get; set; }
    public string? ConfirmationToken { get; set; }
    public string? ReviewNote { get; set; }
    public string? ReviewedBy { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public DateTimeOffset CreateTime { get; set; }
    public DateTimeOffset UpdateTime { get; set; }
    public List<RegistrationMemberResponse> Members { get; set; } = [];

    /// <summary>
    /// 队伍人数，包含队长。
    /// </summary>
    public int TeamSize { get; set; }

    /// <summary>
    /// 队伍所有成员是否已全部接受邀请。队长提交报名即视为已接受，队员状态来自 Registration.MemberInvitations。
    /// </summary>
    public bool? AllMembersAccepted { get; set; }

    public static RegistrationResponse FromEntity(Registration entity) => new()
    {
        Id = entity.Id,
        GameId = entity.GameId,
        TeamId = entity.TeamId,
        TeamName = entity.TeamName ?? entity.Team?.Name,
        TeamBio = entity.TeamBio ?? entity.Team?.Bio,
        CaptainEmail = entity.CaptainEmail ?? entity.Team?.Captain?.Email,
        DivisionId = entity.DivisionId,
        DivisionName = entity.Division?.Name,
        Status = entity.Status,
        FormData = entity.FormData,
        ConfirmationToken = entity.ConfirmationToken,
        ReviewNote = entity.ReviewNote,
        ReviewedBy = entity.Reviewer?.UserName,
        ReviewedAt = entity.ReviewedAt,
        CreateTime = entity.CreateTime,
        UpdateTime = entity.UpdateTime,
        Members = ParseMembers(entity.MemberInvitations),
        TeamSize = ComputeTeamSize(entity),
        AllMembersAccepted = ComputeAllMembersAccepted(entity)
    };

    private static List<RegistrationMemberResponse> ParseMembers(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return [];
        try
        {
            var invitations = JsonSerializer.Deserialize<List<Models.Data.Cyctf.MemberInvitation>>(raw,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return invitations?.Select(member => new RegistrationMemberResponse
            {
                Email = member.Email,
                Status = member.Status,
                MemberFields = member.MemberFields,
                SentAt = member.SentAt,
                RespondedAt = member.RespondedAt
            }).ToList() ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static int ComputeTeamSize(Registration entity)
    {
        // 已创建队伍时以实际成员关系为准，兼容旧的登录报名记录。
        if (entity.Team is not null)
            return Math.Max(1, entity.Team.Members.Count);

        // 待审核的无登录报名尚未创建队伍；未加载队伍关系的旧记录至少包含队长。
        if (!entity.TeamId.HasValue && string.IsNullOrWhiteSpace(entity.CaptainEmail))
            return 0;

        if (string.IsNullOrWhiteSpace(entity.MemberInvitations))
            return 1;

        try
        {
            var invitations = JsonSerializer.Deserialize<List<MemberInvitation>>(entity.MemberInvitations,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return 1 + (invitations?.Count ?? 0);
        }
        catch (JsonException)
        {
            return 1;
        }
    }

    private static bool? ComputeAllMembersAccepted(Registration entity)
    {
        // 队长提交报名即视为已接受；待审核和已通过的报名参与筛选。
        var status = entity.Status.ToUpperInvariant();
        if (status is not ("PENDING" or "APPROVED"))
            return null;
        if (!entity.TeamId.HasValue && string.IsNullOrWhiteSpace(entity.CaptainEmail))
            return null;

        // 没有队员邀请时，队长是唯一成员，结果为全部接受。
        if (string.IsNullOrWhiteSpace(entity.MemberInvitations))
            return true;

        try
        {
            var invitations = JsonSerializer.Deserialize<List<MemberInvitation>>(entity.MemberInvitations,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            return invitations?.All(inv =>
                string.Equals(inv.Status, InvitationStatus.Accepted, StringComparison.OrdinalIgnoreCase) ||
                // 兼容早期保存的 Accepted 布尔字段。
                inv.Accepted == true) ?? true;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private class MemberInvitation
    {
        public string? Email { get; set; }
        public string? Token { get; set; }
        public string? Status { get; set; }
        public bool? Accepted { get; set; }
        public bool? Rejected { get; set; }
        public DateTimeOffset? AcceptedAt { get; set; }
    }
}
