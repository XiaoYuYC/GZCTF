using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace GZCTF.Models.Data.Cyctf;

/// <summary>
/// CYCTF 报名记录
/// </summary>
[Index(nameof(GameId))]
[Index(nameof(TeamId))]
[Index(nameof(DivisionId))]
[Index(nameof(GameId), nameof(TeamId), IsUnique = true)]
public class Registration
{
    [Key]
    [Required]
    public int Id { get; set; }

    /// <summary>
    /// 关联的比赛 ID
    /// </summary>
    [Required]
    public int GameId { get; set; }

    /// <summary>
    /// 关联的队伍 ID（无需登录报名时可能为 null）
    /// </summary>
    public int? TeamId { get; set; }

    /// <summary>
    /// 关联的组别 ID
    /// </summary>
    [Required]
    public int DivisionId { get; set; }

    /// <summary>
    /// 审核通过时由本报名创建的队伍 ID，用于后续清理。
    /// </summary>
    public int? ProvisionedTeamId { get; set; }

    /// <summary>
    /// 审核通过时由本报名新建的账号 ID，用于后续清理；已有账号不会记录在此处。
    /// </summary>
    public List<Guid> ProvisionedUserIds { get; set; } = [];

    /// <summary>
    /// 报名状态（PENDING, APPROVED, REJECTED, CANCELLED）
    /// </summary>
    [Required]
    [MaxLength(50)]
    public string Status { get; set; } = "PENDING";

    /// <summary>
    /// 报名表单数据（JSON）
    /// </summary>
    [Column(TypeName = "text")]
    public string? FormData { get; set; }

    /// <summary>
    /// 队长邮箱（新报名流程使用，为 null 表示旧的登录报名流程）
    /// </summary>
    [MaxLength(256)]
    public string? CaptainEmail { get; set; }

    /// <summary>
    /// 队伍名称（无需登录报名使用，审核通过后用于创建队伍）
    /// </summary>
    [MaxLength(128)]
    public string? TeamName { get; set; }

    /// <summary>
    /// 队伍简介（无需登录报名时保存，审核通过后用于创建队伍）
    /// </summary>
    [MaxLength(72)]
    public string? TeamBio { get; set; }

    /// <summary>
    /// 队员邀请信息 JSON：[{"email":"x@x.com","token":"uuid","accepted":false,"rejected":false,"acceptedAt":null}]
    /// </summary>
    [Column(TypeName = "text")]
    public string? MemberInvitations { get; set; }

    /// <summary>
    /// 报名确认 Token（队长确认邮件使用）
    /// </summary>
    [MaxLength(64)]
    public string? ConfirmationToken { get; set; }

    /// <summary>
    /// 审核备注
    /// </summary>
    [Column(TypeName = "text")]
    public string? ReviewNote { get; set; }

    /// <summary>
    /// 审核人 ID
    /// </summary>
    public Guid? ReviewedBy { get; set; }

    /// <summary>
    /// 审核时间
    /// </summary>
    public DateTimeOffset? ReviewedAt { get; set; }

    /// <summary>
    /// 软删除标记
    /// </summary>
    [Required]
    public bool Deleted { get; set; } = false;

    /// <summary>
    /// 创建时间（报名时间）
    /// </summary>
    [Required]
    public DateTimeOffset CreateTime { get; set; } = DateTimeOffset.UtcNow;

    /// <summary>
    /// 更新时间
    /// </summary>
    [Required]
    public DateTimeOffset UpdateTime { get; set; } = DateTimeOffset.UtcNow;

    #region Db Relationship

    /// <summary>
    /// 关联的 Game
    /// </summary>
    [JsonIgnore]
    public Game Game { get; set; } = null!;

    /// <summary>
    /// 关联的 Team
    /// </summary>
    [JsonIgnore]
    public Team Team { get; set; } = null!;

    /// <summary>
    /// 关联的 Division
    /// </summary>
    [JsonIgnore]
    public Division Division { get; set; } = null!;

    /// <summary>
    /// 审核人
    /// </summary>
    [JsonIgnore]
    public UserInfo? Reviewer { get; set; }

    #endregion
}
