using GZCTF.Models.Internal;
using GZCTF.Services.Cache;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace GZCTF.Test.UnitTests.Models;

public class ClientConfigTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void FromServiceProvider_ExposesRegistrationPolicy(bool allowRegister)
    {
        var services = new ServiceCollection();
        services.AddOptions();
        services.Configure<AccountPolicy>(options => options.AllowRegister = allowRegister);
        services.Configure<GlobalConfig>(_ => { });
        services.Configure<ContainerPolicy>(_ => { });
        services.Configure<ContainerProvider>(_ => { });
        services.Configure<ManagedConfig>(_ => { });

        using var provider = services.BuildServiceProvider();
        var config = ClientConfig.FromServiceProvider(provider);

        Assert.Equal(allowRegister, config.AllowRegister);
    }

    [Fact]
    public void AllowRegister_FlushesClientConfigCache()
    {
        var configs = GZCTF.Services.Config.ConfigService.GetConfigs(new AccountPolicy { AllowRegister = false });
        var registrationConfig = Assert.Single(configs,
            config => config.ConfigKey == $"{nameof(AccountPolicy)}:{nameof(AccountPolicy.AllowRegister)}");

        Assert.Contains(CacheKey.ClientConfig, registrationConfig.CacheKeys!);
    }
}
