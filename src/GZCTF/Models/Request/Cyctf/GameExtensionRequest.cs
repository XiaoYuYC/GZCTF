namespace GZCTF.Models.Request.Cyctf;

/// <summary>
/// 创建/更新比赛扩展信息请求
/// </summary>
public class GameExtensionRequest
{
    /// <summary>
    /// 报名开始时间
    /// </summary>
    public DateTimeOffset RegistrationStartTime { get; set; }

    /// <summary>
    /// 报名结束时间
    /// </summary>
    public DateTimeOffset RegistrationEndTime { get; set; }

    /// <summary>
    /// 最大报名队伍数
    /// </summary>
    public int? MaxTeams { get; set; }

    /// <summary>
    /// 是否显示报名人数
    /// </summary>
    public bool ShowRegistrationCount { get; set; } = true;

    /// <summary>
    /// 是否显示比赛时间
    /// </summary>
    public bool ShowEventTime { get; set; } = true;

    /// <summary>
    /// 比赛状态
    /// </summary>
    public string? Status { get; set; }

    /// <summary>
    /// 赛事通知 QQ 群号。
    /// </summary>
    public string? QqGroupNumber { get; set; }

    /// <summary>
    /// 赛事通知 QQ 群链接。
    /// </summary>
    public string? QqGroupLink { get; set; }
}
