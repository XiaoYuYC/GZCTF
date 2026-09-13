namespace GZCTF.Models.Response.Cyctf;

/// <summary>
/// 批量发送报名邀请邮件的实时进度。
/// </summary>
public class RegistrationInvitationProgressResponse
{
    public int Sent { get; set; }
    public int Total { get; set; }
    public bool Completed { get; set; }
    public bool Failed { get; set; }
    public string? Message { get; set; }
}
