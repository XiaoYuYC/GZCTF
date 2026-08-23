namespace GZCTF.Models.Request.Cyctf;

/// <summary>
/// 队长查询报名请求
/// </summary>
public class RegistrationQueryRequest
{
    public int GameId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string VerificationCode { get; set; } = string.Empty;
}
