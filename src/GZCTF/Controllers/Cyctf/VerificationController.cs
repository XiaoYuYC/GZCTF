using GZCTF.Middlewares;
using GZCTF.Models.Internal;
using GZCTF.Repositories.Interface;
using GZCTF.Services;
using GZCTF.Services.Config;
using GZCTF.Services.Mail;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;

namespace GZCTF.Controllers.Cyctf;

/// <summary>
/// CYCTF 验证码 API
/// </summary>
[Route("api/cyctf/verification")]
[ApiController]
public class VerificationController(
    IDistributedCache cache,
    IGameRepository gameRepository,
    IMailSender mailSender,
    ICaptchaService captcha,
    IOptionsSnapshot<AccountPolicy> accountPolicy,
    IOptionsSnapshot<GlobalConfig> globalConfig,
    ILogger<VerificationController> logger,
    IStringLocalizer<Program> localizer) : ControllerBase
{
    private const int CodeLength = 6;
    private const int CodeExpirationMinutes = 10;
    private const int SendIntervalSeconds = 60;

    /// <summary>
    /// 发送验证码到邮箱
    /// </summary>
    /// <param name="request"></param>
    /// <param name="token"></param>
    /// <returns></returns>
    [HttpPost("send")]
    [EnableRateLimiting(nameof(RateLimiter.LimitPolicy.Register))]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SendVerificationCode([FromBody] SendVerificationCodeRequest request,
        CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new RequestResponse("邮箱不能为空"));

        var email = request.Email.Trim().ToLowerInvariant();

        if (!IsValidEmail(email))
            return BadRequest(new RequestResponse("邮箱格式不正确"));

        if (!IsAllowedEmailDomain(email))
            return BadRequest(new RequestResponse($"邮箱域名不在白名单中：{accountPolicy.Value.EmailDomainList}"));

        // 验证人机验证令牌
        if (string.IsNullOrWhiteSpace(request.Challenge))
            return BadRequest(new RequestResponse("请完成人机验证"));

        if (accountPolicy.Value.UseCaptcha && !await captcha.VerifyAsync(request, HttpContext, token))
            return BadRequest(new RequestResponse("人机验证失败，请重试"));

        if (request.GameId.HasValue)
        {
            var game = await gameRepository.GetGameById(request.GameId.Value, token);
            if (game is null)
                return NotFound(new RequestResponse("比赛不存在"));
        }

        var lastSentKey = $"reg_code_sent:{email}";
        var lastSent = await cache.GetStringAsync(lastSentKey, token);
        if (!string.IsNullOrEmpty(lastSent))
            return BadRequest(new RequestResponse($"验证码已发送，请等待 {SendIntervalSeconds} 秒后再试"));

        var code = GenerateVerificationCode();
        var codeKey = $"reg_code:{email}";

        await cache.SetStringAsync(codeKey, code, new DistributedCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(CodeExpirationMinutes)
        }, token);

        await cache.SetStringAsync(lastSentKey, DateTimeOffset.UtcNow.ToString("O"),
            new DistributedCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(SendIntervalSeconds)
            }, token);

        var content = new MailContent(
            email,
            email,
            "CYCTF 报名验证码",
            $"您的验证码是：<strong style=\"font-size: 24px; color: #1976d2;\">{code}</strong><br/><br/>" +
            $"验证码有效期为 {CodeExpirationMinutes} 分钟，请勿泄露给他人。<br/>" +
            "如果这不是您的操作，请忽略此邮件。",
            globalConfig);

        if (!mailSender.EnqueueMailContent(content))
        {
            logger.LogWarning("Failed to enqueue verification code email for {Email}", email);
            return StatusCode(StatusCodes.Status500InternalServerError,
                new RequestResponse("验证码邮件发送失败，请稍后再试"));
        }

        logger.LogInformation("Verification code sent to {Email}", email);

        return Ok(new RequestResponse($"验证码已发送到 {email}，有效期 {CodeExpirationMinutes} 分钟",
            StatusCodes.Status200OK));
    }

    /// <summary>
    /// 验证验证码（内部方法，供报名控制器调用）
    /// </summary>
    internal static async Task<bool> VerifyCodeAsync(IDistributedCache cache, string email, string code,
        CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(code))
            return false;

        var normalizedEmail = email.Trim().ToLowerInvariant();
        var codeKey = $"reg_code:{normalizedEmail}";

        var storedCode = await cache.GetStringAsync(codeKey, token);
        if (string.IsNullOrEmpty(storedCode))
            return false;

        if (!string.Equals(storedCode, code.Trim(), StringComparison.Ordinal))
            return false;

        await cache.RemoveAsync(codeKey, token);
        return true;
    }

    private static string GenerateVerificationCode()
    {
        var code = Random.Shared.Next(0, 999999).ToString($"D{CodeLength}");
        return code;
    }

    private static bool IsValidEmail(string email)
    {
        try
        {
            var addr = new System.Net.Mail.MailAddress(email);
            return addr.Address == email && email.Contains('@');
        }
        catch
        {
            return false;
        }
    }

    private bool IsAllowedEmailDomain(string email)
    {
        if (string.IsNullOrWhiteSpace(accountPolicy.Value.EmailDomainList))
            return true;

        var separator = email.LastIndexOf('@');
        if (separator < 1 || separator == email.Length - 1)
            return false;

        var domain = email[(separator + 1)..];
        return accountPolicy.Value.EmailDomainList
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(item => item.Trim().TrimStart('@'))
            .Any(item => string.Equals(item, domain, StringComparison.OrdinalIgnoreCase));
    }
}

/// <summary>
/// 发送验证码请求
/// </summary>
public class SendVerificationCodeRequest : ModelWithCaptcha
{
    /// <summary>
    /// 邮箱
    /// </summary>
    public string Email { get; set; } = string.Empty;

    /// <summary>
    /// 比赛 ID（可选，用于额外校验）
    /// </summary>
    public int? GameId { get; set; }
}
