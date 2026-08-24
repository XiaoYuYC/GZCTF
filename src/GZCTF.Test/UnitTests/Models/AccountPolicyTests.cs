using GZCTF.Models.Internal;
using GZCTF.Utils;
using Xunit;

namespace GZCTF.Test.UnitTests.Models;

public class AccountPolicyTests
{
    [Theory]
    [InlineData(Role.Banned, false)]
    [InlineData(Role.User, true)]
    [InlineData(Role.Monitor, true)]
    [InlineData(Role.Admin, true)]
    public void CanCreateSignInSession_RejectsOnlyBannedUsersWhenAdminOnlyLoginIsDisabled(Role role, bool expected)
    {
        var policy = new AccountPolicy();

        Assert.Equal(expected, policy.CanCreateSignInSession(role));
    }

    [Theory]
    [InlineData(Role.Banned, false)]
    [InlineData(Role.User, false)]
    [InlineData(Role.Monitor, false)]
    [InlineData(Role.Admin, true)]
    public void CanCreateSignInSession_AllowsOnlyAdminsWhenAdminOnlyLoginIsEnabled(Role role, bool expected)
    {
        var policy = new AccountPolicy { AdminOnlyLogin = true };

        Assert.Equal(expected, policy.CanCreateSignInSession(role));
    }
}
