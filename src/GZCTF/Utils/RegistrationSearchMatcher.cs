using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;

namespace GZCTF.Utils;

/// <summary>
/// Matches administrator search expressions against all human-readable registration values.
/// </summary>
public static class RegistrationSearchMatcher
{
    public const string TextMode = "text";
    public const string WildcardMode = "wildcard";
    public const string RegexMode = "regex";
    public const int MaxQueryLength = 256;

    private static readonly TimeSpan RegexTimeout = TimeSpan.FromMilliseconds(250);
    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    public static Func<string?, bool> CreateMatcher(string query, string? mode = null)
    {
        ArgumentNullException.ThrowIfNull(query);

        if (query.Length > MaxQueryLength)
            throw new ArgumentException($"搜索内容最多支持 {MaxQueryLength} 个字符。", nameof(query));

        var normalizedMode = NormalizeMode(mode);
        if (query.Length == 0)
            return _ => true;

        return normalizedMode switch
        {
            TextMode => value => value?.IndexOf(query, StringComparison.OrdinalIgnoreCase) >= 0,
            WildcardMode => CreateRegexMatcher(ToWildcardRegex(query), RegexOptions.Singleline),
            RegexMode => CreateRegexMatcher(query),
            _ => throw new InvalidOperationException("搜索模式未规范化。")
        };
    }

    public static bool MatchesRegistration(Registration registration, Func<string?, bool> matcher)
    {
        ArgumentNullException.ThrowIfNull(registration);
        ArgumentNullException.ThrowIfNull(matcher);

        return EnumerateSearchValues(registration).Any(matcher);
    }

    private static string NormalizeMode(string? mode)
    {
        var normalized = string.IsNullOrWhiteSpace(mode) ? TextMode : mode.Trim().ToLowerInvariant();
        return normalized switch
        {
            TextMode or "contains" => TextMode,
            WildcardMode or "glob" => WildcardMode,
            RegexMode or "regexp" => RegexMode,
            _ => throw new ArgumentException("搜索模式无效。支持 text、wildcard 和 regex。", nameof(mode))
        };
    }

    private static Func<string?, bool> CreateRegexMatcher(string pattern, RegexOptions additionalOptions = RegexOptions.None)
    {
        var regex = new Regex(pattern,
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | additionalOptions, RegexTimeout);
        return value => value is not null && regex.IsMatch(value);
    }

    private static string ToWildcardRegex(string pattern)
    {
        var builder = new StringBuilder(pattern.Length * 2);
        foreach (var character in pattern)
        {
            switch (character)
            {
                case '*':
                    builder.Append(".*");
                    break;
                case '?':
                    builder.Append('.');
                    break;
                default:
                    builder.Append(Regex.Escape(character.ToString()));
                    break;
            }
        }

        return builder.ToString();
    }

    private static IEnumerable<string> EnumerateSearchValues(Registration registration)
    {
        if (registration.TeamName is not null)
            yield return registration.TeamName;
        if (registration.TeamBio is not null)
            yield return registration.TeamBio;
        if (registration.CaptainEmail is not null)
            yield return registration.CaptainEmail;
        if (registration.Status is not null)
            yield return registration.Status;
        if (registration.ReviewNote is not null)
            yield return registration.ReviewNote;
        if (registration.Division is { Name: not null } division)
            yield return division.Name;

        foreach (var value in EnumerateJsonValues(registration.FormData))
            yield return value;

        if (registration.Team is { } team)
        {
            yield return team.Name;
            if (team.Bio is not null)
                yield return team.Bio;

            if (team.Captain is { } captain)
            {
                foreach (var value in EnumerateUserValues(captain))
                    yield return value;
            }

            foreach (var member in team.Members)
            {
                foreach (var value in EnumerateUserValues(member))
                    yield return value;
            }
        }

        if (string.IsNullOrWhiteSpace(registration.MemberInvitations))
            yield break;

        var invitations = TryDeserializeInvitations(registration.MemberInvitations);
        if (invitations is null)
        {
            // Keep malformed legacy data searchable as a raw value.
            yield return registration.MemberInvitations;
            yield break;
        }

        foreach (var invitation in invitations)
        {
            if (invitation.Email is not null)
                yield return invitation.Email;
            if (invitation.Status is not null)
                yield return invitation.Status;
            foreach (var value in EnumerateJsonValues(invitation.MemberFields))
                yield return value;
        }
    }

    private static IEnumerable<string> EnumerateUserValues(UserInfo user)
    {
        if (user.UserName is not null)
            yield return user.UserName;
        if (user.Email is not null)
            yield return user.Email;
        if (user.RealName is not null)
            yield return user.RealName;
        if (user.StdNumber is not null)
            yield return user.StdNumber;
        if (user.PhoneNumber is not null)
            yield return user.PhoneNumber;
        if (user.Bio is not null)
            yield return user.Bio;
    }

    private static List<MemberInvitation>? TryDeserializeInvitations(string raw)
    {
        try
        {
            return JsonSerializer.Deserialize<List<MemberInvitation>>(raw, JsonOptions);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IEnumerable<string> EnumerateJsonValues(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            yield break;

        var document = TryParseJson(raw);
        if (document is null)
        {
            yield return raw;
            yield break;
        }

        using (document)
        {
            foreach (var value in EnumerateJsonElement(document.RootElement))
                yield return value;
        }
    }

    private static JsonDocument? TryParseJson(string raw)
    {
        try
        {
            return JsonDocument.Parse(raw);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static IEnumerable<string> EnumerateJsonElement(JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                foreach (var property in element.EnumerateObject())
                {
                    yield return property.Name;
                    foreach (var value in EnumerateJsonElement(property.Value))
                        yield return value;
                }

                break;
            case JsonValueKind.Array:
                foreach (var item in element.EnumerateArray())
                {
                    foreach (var value in EnumerateJsonElement(item))
                        yield return value;
                }

                break;
            case JsonValueKind.String:
                if (element.GetString() is { } stringValue)
                    yield return stringValue;
                break;
            case JsonValueKind.Number:
            case JsonValueKind.True:
            case JsonValueKind.False:
                yield return element.GetRawText();
                break;
        }
    }
}
