using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace GZCTF.Models.Request.Game;

/// <summary>
/// Public scoreboard containing team-level ranking data only.
/// </summary>
public sealed class PublicScoreboardModel
{
    /// <summary>
    /// Update time.
    /// </summary>
    [Required]
    [JsonPropertyName("updateTimeUtc")]
    public DateTimeOffset UpdateTimeUtc { get; set; }

    /// <summary>
    /// Team ranking summaries.
    /// </summary>
    [Required]
    [JsonPropertyName("items")]
    public List<PublicScoreboardItem> Items { get; set; } = [];

    /// <summary>
    /// Public division names.
    /// </summary>
    [Required]
    [JsonPropertyName("divisions")]
    public List<PublicScoreboardDivision> Divisions { get; set; } = [];

    public static PublicScoreboardModel FromScoreboard(ScoreboardModel scoreboard) => new()
    {
        UpdateTimeUtc = scoreboard.UpdateTimeUtc,
        Items = scoreboard.Items.Values.Select(PublicScoreboardItem.FromScoreboard).ToList(),
        Divisions = scoreboard.Divisions.Values.Select(PublicScoreboardDivision.FromDivision).ToList()
    };
}

/// <summary>
/// Public team ranking summary.
/// </summary>
public sealed class PublicScoreboardItem
{
    /// <summary>
    /// Team ID.
    /// </summary>
    [Required]
    [JsonPropertyName("id")]
    public int Id { get; set; }

    /// <summary>
    /// Team name.
    /// </summary>
    [Required]
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    /// <summary>
    /// Division of participation.
    /// </summary>
    [JsonPropertyName("divisionId")]
    public int? DivisionId { get; set; }

    /// <summary>
    /// Team avatar.
    /// </summary>
    [JsonPropertyName("avatar")]
    public string? Avatar { get; set; }

    /// <summary>
    /// Total score.
    /// </summary>
    [Required]
    [JsonPropertyName("score")]
    public int Score { get; set; }

    /// <summary>
    /// Overall rank.
    /// </summary>
    [Required]
    [JsonPropertyName("rank")]
    public int Rank { get; set; }

    /// <summary>
    /// Division rank.
    /// </summary>
    [JsonPropertyName("divisionRank")]
    public int? DivisionRank { get; set; }

    /// <summary>
    /// Number of solved challenges.
    /// </summary>
    [Required]
    [JsonPropertyName("solvedCount")]
    public int SolvedCount { get; set; }

    public static PublicScoreboardItem FromScoreboard(ScoreboardItem item) => new()
    {
        Id = item.Id,
        Name = item.Name,
        DivisionId = item.DivisionId,
        Avatar = item.Avatar,
        Score = item.Score,
        Rank = item.Rank,
        DivisionRank = item.DivisionRank,
        SolvedCount = item.SolvedCount
    };
}

/// <summary>
/// Public division information.
/// </summary>
public sealed class PublicScoreboardDivision
{
    /// <summary>
    /// Division ID.
    /// </summary>
    [Required]
    [JsonPropertyName("id")]
    public int Id { get; set; }

    /// <summary>
    /// Division name.
    /// </summary>
    [Required]
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    public static PublicScoreboardDivision FromDivision(DivisionItem division) => new()
    {
        Id = division.Id,
        Name = division.Name
    };
}
