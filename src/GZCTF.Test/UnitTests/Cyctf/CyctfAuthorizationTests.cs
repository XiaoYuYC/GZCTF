using System;
using System.Reflection;
using GZCTF.Controllers.Cyctf;
using GZCTF.Middlewares;
using Xunit;

namespace GZCTF.Test.UnitTests.Cyctf;

public class CyctfAuthorizationTests
{
    [Theory]
    [InlineData(typeof(GameExtensionController), nameof(GameExtensionController.CreateOrUpdateGameExtension))]
    [InlineData(typeof(GameExtensionController), nameof(GameExtensionController.DeleteGameExtension))]
    [InlineData(typeof(DivisionExtensionController), nameof(DivisionExtensionController.CreateOrUpdateDivisionExtension))]
    [InlineData(typeof(DivisionExtensionController), nameof(DivisionExtensionController.DeleteDivisionExtension))]
    [InlineData(typeof(AwardController), nameof(AwardController.CreateAward))]
    [InlineData(typeof(AwardController), nameof(AwardController.UpdateAward))]
    [InlineData(typeof(AwardController), nameof(AwardController.DeleteAward))]
    [InlineData(typeof(SponsorController), nameof(SponsorController.CreateSponsor))]
    [InlineData(typeof(SponsorController), nameof(SponsorController.UpdateSponsor))]
    [InlineData(typeof(SponsorController), nameof(SponsorController.DeleteSponsor))]
    [InlineData(typeof(RegistrationController), nameof(RegistrationController.GetGameRegistrations))]
    [InlineData(typeof(RegistrationController), nameof(RegistrationController.GetRegistration))]
    [InlineData(typeof(RegistrationController), nameof(RegistrationController.ReviewRegistration))]
    [InlineData(typeof(RegistrationController), nameof(RegistrationController.CancelRegistration))]
    [InlineData(typeof(RegistrationController), nameof(RegistrationController.Export))]
    [InlineData(typeof(RegistrationController), nameof(RegistrationController.GetRegistrationStats))]
    public void AdminEndpoint_UsesNativeRequireAdminAttribute(Type controllerType, string methodName)
    {
        var method = controllerType.GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public);

        Assert.NotNull(method);
        Assert.NotNull(method!.GetCustomAttribute<RequireAdminAttribute>());
        Assert.Empty(method.GetCustomAttributes<Microsoft.AspNetCore.Authorization.AuthorizeAttribute>());
    }

    [Theory]
    [InlineData(nameof(RegistrationController.RegisterTeam))]
    [InlineData(nameof(RegistrationController.GetMyRegistration))]
    public void PublicRegistrationEndpoint_RetainsAuthenticatedAuthorization(string methodName)
    {
        var method = typeof(RegistrationController).GetMethod(methodName, BindingFlags.Instance | BindingFlags.Public);

        Assert.NotNull(method);
        Assert.NotNull(method!.GetCustomAttribute<Microsoft.AspNetCore.Authorization.AuthorizeAttribute>());
        Assert.Null(method.GetCustomAttribute<RequireAdminAttribute>());
    }
}
