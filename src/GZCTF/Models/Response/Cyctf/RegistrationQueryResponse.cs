namespace GZCTF.Models.Response.Cyctf;

/// <summary>
/// 队长查询报名响应
/// </summary>
public class RegistrationQueryResponse
{
    private static readonly System.Text.Json.JsonSerializerOptions MemberJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public int Id { get; set; }
    public int GameId { get; set; }
    public string? GameTitle { get; set; }
    public string? TeamName { get; set; }
    public string? CaptainEmail { get; set; }
    public string? DivisionName { get; set; }
    public string Status { get; set; } = string.Empty;
    public string? ReviewNote { get; set; }
    public DateTimeOffset CreateTime { get; set; }
    public DateTimeOffset? ReviewedAt { get; set; }
    public string? AccessToken { get; set; }
    public List<RegistrationMemberResponse> Members { get; set; } = [];

    public static RegistrationQueryResponse FromEntity(Models.Data.Cyctf.Registration registration) => new()
    {
        Id = registration.Id,
        GameId = registration.GameId,
        GameTitle = registration.Game?.Title,
        TeamName = registration.TeamName ?? registration.Team?.Name,
        CaptainEmail = registration.CaptainEmail,
        DivisionName = registration.Division?.Name,
        Status = registration.Status,
        ReviewNote = registration.ReviewNote,
        CreateTime = registration.CreateTime,
        ReviewedAt = registration.ReviewedAt,
        Members = ParseMembers(registration.MemberInvitations)
    };

    private static List<RegistrationMemberResponse> ParseMembers(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return [];
        try
        {
            var invitations = System.Text.Json.JsonSerializer.Deserialize<List<Models.Data.Cyctf.MemberInvitation>>(raw, MemberJsonOptions);
            return invitations?.Select(member => new RegistrationMemberResponse
            {
                Email = member.Email,
                Status = member.Status,
                SentAt = member.SentAt,
                RespondedAt = member.RespondedAt
            }).ToList() ?? [];
        }
        catch (System.Text.Json.JsonException)
        {
            return [];
        }
    }
}

public class RegistrationMemberResponse
{
    public string Email { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public DateTimeOffset SentAt { get; set; }
    public DateTimeOffset? RespondedAt { get; set; }
}