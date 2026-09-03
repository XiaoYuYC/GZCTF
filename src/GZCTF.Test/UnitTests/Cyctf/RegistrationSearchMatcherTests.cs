using System;
using System.Text.Json;
using System.Text.RegularExpressions;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Utils;
using Xunit;

namespace GZCTF.Test.UnitTests.Cyctf;

public class RegistrationSearchMatcherTests
{
    [Theory]
    [InlineData("phoenix")]
    [InlineData("Robotics Club")]
    [InlineData("CAPTAIN@EXAMPLE.COM")]
    [InlineData("pending")]
    [InlineData("verified manually")]
    [InlineData("university division")]
    [InlineData("school")]
    [InlineData("Example University")]
    [InlineData("grade")]
    [InlineData("2026")]
    [InlineData("hydrated squad")]
    [InlineData("related team bio")]
    [InlineData("captain-user")]
    [InlineData("Captain Real Name")]
    [InlineData("CAP-001")]
    [InlineData("13800000000")]
    [InlineData("member@example.com")]
    [InlineData("Member Real Name")]
    [InlineData("MEM-002")]
    [InlineData("accepted")]
    [InlineData("invited-field")]
    public void TextMode_SearchesAllHumanReadableRegistrationValues(string query)
    {
        var registration = CreateRegistration();
        var matcher = RegistrationSearchMatcher.CreateMatcher(query, RegistrationSearchMatcher.TextMode);

        Assert.True(RegistrationSearchMatcher.MatchesRegistration(registration, matcher));
    }

    [Theory]
    [InlineData("Pho*Squad")]
    [InlineData("captain?user")]
    [InlineData("MEM-00?")]
    [InlineData("member*@example.com")]
    public void WildcardMode_SupportsStarAndQuestionMark(string query)
    {
        var registration = CreateRegistration();
        var matcher = RegistrationSearchMatcher.CreateMatcher(query, RegistrationSearchMatcher.WildcardMode);

        Assert.True(RegistrationSearchMatcher.MatchesRegistration(registration, matcher));
    }
    [Fact]
    public void WildcardMode_TreatsOtherRegexCharactersLiterally()
    {
        var matcher = RegistrationSearchMatcher.CreateMatcher("Team [A].*", RegistrationSearchMatcher.WildcardMode);

        Assert.True(matcher("Team [A].value"));
        Assert.False(matcher("Team A-value"));
    }

    [Fact]
    public void WildcardMode_StarMatchesNewlines()
    {
        var matcher = RegistrationSearchMatcher.CreateMatcher("first*last", RegistrationSearchMatcher.WildcardMode);

        Assert.True(matcher("first\nlast"));
    }


    [Theory]
    [InlineData("^Phoenix\\s+Squad$")]
    [InlineData("member@(example|test)\\.com")]
    [InlineData("^CAP-\\d{3}$")]
    public void RegexMode_MatchesCaseInsensitively(string query)
    {
        var registration = CreateRegistration();
        var matcher = RegistrationSearchMatcher.CreateMatcher(query, RegistrationSearchMatcher.RegexMode);

        Assert.True(RegistrationSearchMatcher.MatchesRegistration(registration, matcher));
    }

    [Fact]
    public void TextMode_DoesNotMatchUnrelatedValues()
    {
        var matcher = RegistrationSearchMatcher.CreateMatcher("not-present-anywhere");

        Assert.False(RegistrationSearchMatcher.MatchesRegistration(CreateRegistration(), matcher));
    }

    [Theory]
    [InlineData("contains")]
    [InlineData("glob")]
    [InlineData("regexp")]
    public void CreateMatcher_AcceptsModeAliases(string mode)
    {
        var query = mode == "glob" ? "Phoenix*" : mode == "regexp" ? "Phoenix\\s+Squad" : "phoenix";
        var matcher = RegistrationSearchMatcher.CreateMatcher(query, mode);

        Assert.True(matcher("Phoenix Squad"));
    }

    [Fact]
    public void CreateMatcher_RejectsInvalidMode()
    {
        var exception = Assert.Throws<ArgumentException>(() =>
            RegistrationSearchMatcher.CreateMatcher("query", "invalid"));

        Assert.Contains("搜索模式无效", exception.Message);
    }

    [Fact]
    public void CreateMatcher_RejectsInvalidRegex()
    {
        Assert.Throws<RegexParseException>(() =>
            RegistrationSearchMatcher.CreateMatcher("[", RegistrationSearchMatcher.RegexMode));
    }

    [Fact]
    public void CreateMatcher_RejectsOverlongQuery()
    {
        var query = new string('x', RegistrationSearchMatcher.MaxQueryLength + 1);

        var exception = Assert.Throws<ArgumentException>(() => RegistrationSearchMatcher.CreateMatcher(query));
        Assert.Contains(RegistrationSearchMatcher.MaxQueryLength.ToString(), exception.Message);
    }

    [Fact]
    public void EmptyQuery_MatchesAnyValue()
    {
        var matcher = RegistrationSearchMatcher.CreateMatcher(string.Empty, RegistrationSearchMatcher.TextMode);

        Assert.True(matcher(null));
    }

    [Fact]
    public void MalformedJson_RemainsSearchableAsRawText()
    {
        var registration = new Registration
        {
            FormData = "legacy-form-value:{broken",
            MemberInvitations = "legacy-member-value:{broken"
        };

        Assert.True(RegistrationSearchMatcher.MatchesRegistration(
            registration, RegistrationSearchMatcher.CreateMatcher("legacy-form-value")));
        Assert.True(RegistrationSearchMatcher.MatchesRegistration(
            registration, RegistrationSearchMatcher.CreateMatcher("legacy-member-value")));
    }

    private static Registration CreateRegistration()
    {
        var captain = new UserInfo
        {
            UserName = "captain-user",
            Email = "captain-account@example.com",
            RealName = "Captain Real Name",
            StdNumber = "CAP-001",
            PhoneNumber = "13800000000",
            Bio = "Captain profile bio"
        };
        var member = new UserInfo
        {
            UserName = "member-user",
            Email = "member-account@example.com",
            RealName = "Member Real Name",
            StdNumber = "MEM-002",
            PhoneNumber = "13900000000",
            Bio = "Member profile bio"
        };
        var team = new Team
        {
            Name = "Hydrated Squad",
            Bio = "Related team bio",
            Captain = captain
        };
        team.Members.Add(captain);
        team.Members.Add(member);

        return new Registration
        {
            TeamName = "Phoenix Squad",
            TeamBio = "Robotics Club",
            CaptainEmail = "captain@example.com",
            Status = "PENDING",
            ReviewNote = "Verified manually",
            Division = new Division { Name = "University Division" },
            FormData = "{\"school\":\"Example University\",\"grade\":2026,\"confirmed\":true}",
            Team = team,
            MemberInvitations = JsonSerializer.Serialize(new[]
            {
                new MemberInvitation
                {
                    Email = "member@example.com",
                    Status = InvitationStatus.Accepted,
                    MemberFields = "{\"customField\":\"invited-field\"}"
                }
            })
        };
    }
}
