using System.ComponentModel.DataAnnotations;

namespace GZCTF.Models.Request.Cyctf;

/// <summary>
/// 队员信息请求
/// </summary>
public class MemberInfoRequest
{
    /// <summary>
    /// 队员邮箱
    /// </summary>
    [Required]
    [MaxLength(256)]
    [EmailAddress]
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// 队员字段数据（JSON 字符串）
    /// </summary>
    public string? MemberFields { get; set; }
}
