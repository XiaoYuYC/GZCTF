using GZCTF.Models.Data.Cyctf;
using GZCTF.Models.Response.Cyctf;
using Xunit;

namespace GZCTF.Test.UnitTests.Cyctf;

public class CyctfSponsorResponseTests
{
    [Fact]
    public void FromEntity_PreservesTeamReferenceAndDisplayName()
    {
        var entity = new Sponsor
        {
            Id = 7,
            GameId = 3,
            TeamId = 11,
            TeamName = "Example Team",
            ShortName = "Example",
            Type = "SPONSOR"
        };

        var response = SponsorResponse.FromEntity(entity);

        Assert.Equal(11, response.TeamId);
        Assert.Equal("Example Team", response.TeamName);
    }

    [Fact]
    public void FromEntity_PreservesCustomTeamNameWithoutTeamId()
    {
        var entity = new Sponsor
        {
            Id = 8,
            GameId = 3,
            TeamName = "Custom Sponsor Team",
            ShortName = "Custom",
            Type = "SPONSOR"
        };

        var response = SponsorResponse.FromEntity(entity);

        Assert.Null(response.TeamId);
        Assert.Equal("Custom Sponsor Team", response.TeamName);
    }
}
