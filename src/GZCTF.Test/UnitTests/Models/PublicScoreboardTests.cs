using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using GZCTF.Models;
using GZCTF.Models.Request.Game;
using GZCTF.Utils;
using Xunit;

namespace GZCTF.Test.UnitTests.Models;

public class PublicScoreboardTests
{
    [Fact]
    public void PublicScoreboard_ContainsTeamSummaryOnly()
    {
        var item = new ScoreboardItem
        {
            Id = 7,
            Name = "Team 7",
            Bio = "team bio",
            DivisionId = 3,
            Avatar = "/avatar/team-7",
            Score = 321,
            Rank = 2,
            DivisionRank = 1,
            LastSubmissionTime = DateTimeOffset.UtcNow,
            SolvedChallenges =
            [
                new ChallengeItem
                {
                    Id = 11,
                    Score = 321,
                    UserName = "member-7",
                    SubmitTimeUtc = DateTimeOffset.UtcNow
                }
            ]
        };
        var scoreboard = new ScoreboardModel
        {
            Items = new Dictionary<int, ScoreboardItem> { [item.Id] = item },
            Divisions = new Dictionary<int, DivisionItem>
            {
                [3] = new DivisionItem { Id = 3, Name = "Division 3" }
            },
            TimeLines = new Dictionary<int, IEnumerable<TopTimeLine>>(),
            Challenges = new Dictionary<ChallengeCategory, IEnumerable<ChallengeInfo>>()
        };

        var json = JsonSerializer.Serialize(PublicScoreboardModel.FromScoreboard(scoreboard), AppDbContext.JsonOptions);
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;

        var rootFields = root.EnumerateObject().Select(property => property.Name).ToArray();
        Assert.Equal(["updateTimeUtc", "items", "divisions"], rootFields);

        var publicItem = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal(7, publicItem.GetProperty("id").GetInt32());
        Assert.Equal("Team 7", publicItem.GetProperty("name").GetString());
        Assert.Equal(321, publicItem.GetProperty("score").GetInt32());
        Assert.Equal(2, publicItem.GetProperty("rank").GetInt32());
        Assert.Equal(1, publicItem.GetProperty("divisionRank").GetInt32());
        Assert.Equal(1, publicItem.GetProperty("solvedCount").GetInt32());

        foreach (var forbiddenField in new[]
                 {
                     "bio", "lastSubmissionTime", "solvedChallenges", "userName", "type", "time", "participants"
                 })
            Assert.False(publicItem.TryGetProperty(forbiddenField, out _), $"Unexpected field: {forbiddenField}");
    }
}