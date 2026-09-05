using System.ComponentModel.DataAnnotations;
using GZCTF.Services;

namespace GZCTF.Models.Request.Cyctf;

/// <summary>
/// 报名请求
/// </summary>
public class RegistrationRequest : ModelWithCaptcha
{
    /// <summary>
    /// 比赛 ID
    /// </summary>
    public int GameId { get; set; }

    /// <summary>
    /// 新队伍名称
    /// </summary>
    [MaxLength(Limits.MaxTeamNameLength, ErrorMessageResourceName = nameof(Resources.Program.Model_TeamNameTooLong),
        ErrorMessageResourceType = typeof(Resources.Program))]
    public string? TeamName { get; set; }

    /// <summary>
    /// 新队伍简介
    /// </summary>
    [MaxLength(Limits.MaxTeamBioLength, ErrorMessageResourceName = nameof(Resources.Program.Model_TeamBioTooLong),
        ErrorMessageResourceType = typeof(Resources.Program))]
    public string? TeamBio { get; set; }

    /// <summary>
    /// 组别 ID
    /// </summary>
    public int DivisionId { get; set; }

    /// <summary>
    /// 报名表单数据（JSON 字符串）
    /// </summary>
    public string? FormData { get; set; }

    /// <summary>
    /// 队长邮箱（新的无需登录报名流程）
    /// </summary>
    [MaxLength(256)]
    [EmailAddress]
    public string? CaptainEmail { get; set; }

    /// <summary>
    /// 验证码（新的无需登录报名流程）
    /// </summary>
    [MaxLength(10)]
    public string? VerificationCode { get; set; }

    /// <summary>
    /// 队员信息列表（新的无需登录报名流程）
    /// </summary>
    public List<MemberInfoRequest>? Members { get; set; }
}

/// <summary>
/// 审核报名请求
/// </summary>
public class RegistrationReviewRequest
{
    /// <summary>
    /// 审核状态（APPROVED, REJECTED）
    /// </summary>
    public string Status { get; set; } = string.Empty;

    /// <summary>
    /// 兼容旧客户端保留；备注请通过独立接口保存。
    /// </summary>
    public string? ReviewNote { get; set; }
}

/// <summary>
/// 独立更新报名审核备注请求
/// </summary>
public class RegistrationReviewNoteRequest
{
    /// <summary>
    /// 审核备注
    /// </summary>
    public string? ReviewNote { get; set; }
}
