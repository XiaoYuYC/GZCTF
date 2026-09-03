using System;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Models.Response.Cyctf;
using Xunit;

namespace GZCTF.Test.UnitTests.Cyctf;

public class GameExtensionResponseTests
{
    [Fact]
    public void FromEntity_MapsOptionalQqGroupFields()
    {
        var entity = new GameExtension
        {
            GameId = 7,
            RegistrationStartTime = DateTimeOffset.UtcNow,
            RegistrationEndTime = DateTimeOffset.UtcNow.AddHours(2),
            QqGroupNumber = "123456789",
            QqGroupLink = "https://qm.qq.com/example"
        };

        var response = GameExtensionResponse.FromEntity(entity);

        Assert.Equal(entity.QqGroupNumber, response.QqGroupNumber);
        Assert.Equal(entity.QqGroupLink, response.QqGroupLink);
    }

    [Fact]
    public void FromEntity_AllowsLegacyExtensionWithoutQqGroupFields()
    {
        var response = GameExtensionResponse.FromEntity(new GameExtension
        {
            GameId = 8,
            RegistrationStartTime = DateTimeOffset.UtcNow,
            RegistrationEndTime = DateTimeOffset.UtcNow.AddHours(2)
        });

        Assert.Null(response.QqGroupNumber);
        Assert.Null(response.QqGroupLink);
    }
}