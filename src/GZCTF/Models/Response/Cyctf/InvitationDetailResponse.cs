namespace GZCTF.Models.Response.Cyctf;

/// <summary>
/// 队员邀请详情响应
/// </summary>
public class InvitationDetailResponse
{
    /// <summary>
    /// 邀请令牌
    /// </summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// 队员邮箱
    /// </summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// 邀请状态：Pending, Accepted, Rejected
    /// </summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>
    /// 比赛名称
    /// </summary>
    public string GameTitle { get; set; } = string.Empty;

    /// <summary>
    /// 队伍名称（从 FormData 中解析或使用占位符）
    /// </summary>
    public string TeamName { get; set; } = string.Empty;

    /// <summary>
    /// 队长邮箱
    /// </summary>
    public string CaptainEmail { get; set; } = string.Empty;

    /// <summary>
    /// 报名状态：PENDING, APPROVED, REJECTED, CANCELLED
    /// </summary>
    public string RegistrationStatus { get; set; } = string.Empty;

    /// <summary>
    /// 邀请发送时间
    /// </summary>
    public DateTimeOffset SentAt { get; set; }

    /// <summary>
    /// 响应时间
    /// </summary>
    public DateTimeOffset? RespondedAt { get; set; }
}
