namespace GZCTF.Models.Data.Cyctf;

/// <summary>
/// 队员邀请信息（用于序列化到 Registration.MemberInvitations JSON）
/// </summary>
public class MemberInvitation
{
    /// <summary>
    /// 队员邮箱
    /// </summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// 邀请令牌
    /// </summary>
    public string Token { get; set; } = string.Empty;

    /// <summary>
    /// 邀请状态：Pending, Accepted, Rejected
    /// </summary>
    public string Status { get; set; } = "Pending";

    /// <summary>
    /// 队员字段数据（JSON 字符串）
    /// </summary>
    public string? MemberFields { get; set; }

    /// <summary>
    /// 邀请发送时间
    /// </summary>
    public DateTimeOffset SentAt { get; set; }

    /// <summary>
    /// 响应时间
    /// </summary>
    public DateTimeOffset? RespondedAt { get; set; }
}