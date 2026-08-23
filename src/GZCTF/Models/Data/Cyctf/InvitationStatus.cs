namespace GZCTF.Models.Data.Cyctf;

/// <summary>
/// 队员邀请状态常量
/// </summary>
public static class InvitationStatus
{
    /// <summary>
    /// 待处理
    /// </summary>
    public const string Pending = "PENDING";
    
    /// <summary>
    /// 已接受
    /// </summary>
    public const string Accepted = "ACCEPTED";
    
    /// <summary>
    /// 已拒绝
    /// </summary>
    public const string Rejected = "REJECTED";
}
