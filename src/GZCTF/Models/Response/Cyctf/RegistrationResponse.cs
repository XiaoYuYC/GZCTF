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
    
    /// <summary>
    /// 队伍所有成员是否已全部接受邀请（基于 Participation.Members 和 Registration.MemberInvitations）
    /// </summary>
    public bool? AllMembersAccepted { get; set; }

    public static RegistrationResponse FromEntity(Registration entity) => new()
    {
        Id = entity.Id,
        GameId = entity.GameId,
        TeamId = entity.TeamId,
        TeamName = entity.Team?.Name,
        CaptainEmail = entity.CaptainEmail,
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
        AllMembersAccepted = ComputeAllMembersAccepted(entity)
    };

    private static bool? ComputeAllMembersAccepted(Registration entity)
    {
        // 仅对已通过的报名才计算成员接受状态
        if (entity.Status != "APPROVED" || entity.TeamId is null)
            return null;

        // 解析 MemberInvitations JSON
        if (!string.IsNullOrWhiteSpace(entity.MemberInvitations))
        {
            try
            {
                var invitations = JsonSerializer.Deserialize<List<MemberInvitation>>(entity.MemberInvitations);
                if (invitations != null && invitations.Count > 0)
                {
                    return invitations.All(inv => inv.Accepted == true);
                }
            }
            catch
            {
                // JSON 解析失败，返回 null
                return null;
            }
        }

        // 没有 MemberInvitations 或为空，视为全部接受（队长单人或旧报名流程）
        return true;
    }

    private class MemberInvitation
    {
        public string? Email { get; set; }
        public string? Token { get; set; }
        public bool? Accepted { get; set; }
        public bool? Rejected { get; set; }
        public DateTimeOffset? AcceptedAt { get; set; }
    }
}
