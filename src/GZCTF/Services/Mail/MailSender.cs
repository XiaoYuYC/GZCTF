using System.Collections.Concurrent;
using System.Net.Security;
using System.Text;
using GZCTF.Models.Internal;
using MailKit.Net.Smtp;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;
using MimeKit;
using MimeKit.Text;

namespace GZCTF.Services.Mail;

public sealed class MailSender : IMailSender, IDisposable
{
    private readonly CancellationToken _cancellationToken;
    private readonly CancellationTokenSource _cancellationTokenSource = new();
    private readonly ILogger<MailSender> _logger;
    private readonly ConcurrentQueue<MailContent> _mailQueue = new();
    private readonly EmailConfig? _options;
    private readonly AsyncManualResetEvent _resetEvent = new();
    private readonly SmtpClient? _smtpClient;
    private readonly bool _useSmtpAuthentication;
    private bool _disposed;

    public MailSender(
        IOptions<AccountPolicy> accountPolicy,
        IOptions<EmailConfig> options,
        ILogger<MailSender> logger)
    {
        _logger = logger;
        _options = options.Value;
        var hasUserName = !string.IsNullOrWhiteSpace(_options.UserName);
        var hasPassword = !string.IsNullOrWhiteSpace(_options.Password);
        _useSmtpAuthentication = hasUserName && hasPassword;
        _cancellationToken = _cancellationTokenSource.Token;

        if (hasUserName != hasPassword)
            _logger.SystemLog("SMTP username/password is partially configured. SMTP AUTH will be skipped.",
                TaskStatus.Degraded, LogLevel.Warning);

        if (string.IsNullOrWhiteSpace(_options.SenderAddress) ||
            string.IsNullOrWhiteSpace(_options.Smtp?.Host) || _options.Smtp.Port <= 0)
            return;

        _smtpClient = new();
        _smtpClient.AuthenticationMechanisms.Remove("XOAUTH2");

        if (!OperatingSystem.IsWindows())
            // Some systems may not enable old (non-recommend) ciphers in TLS configuration and lead to failures when
            // connecting to some SMTP servers, override the default policy to include all ciphers except MD5, SHA1, and NULL
            _smtpClient.SslCipherSuitesPolicy = new CipherSuitesPolicy(Enum.GetValues<TlsCipherSuite>()
                .Where(cipher =>
                {
                    var cipherName = cipher.ToString();
                    // Exclude MD5, SHA1, and NULL ciphers for security reasons
                    return !cipherName.EndsWith("MD5") && !cipherName.EndsWith("SHA") &&
                           !cipherName.EndsWith("NULL");
                }));

        _smtpClient.ServerCertificateValidationCallback = (_, _, _, errors)
            => errors is SslPolicyErrors.None || options.Value.Smtp?.BypassCertVerify is true;

        if (!TestSmtpClient())
        {
            if (accountPolicy.Value.EmailConfirmationRequired)
                ExitWithFatalMessage(StaticLocalizer[nameof(Resources.Program.MailSender_InvalidEmailConfig)]);

            _smtpClient.Dispose();
            _smtpClient = null;
            return;
        }

        _logger.SystemLog(StaticLocalizer[nameof(Resources.Program.MailSender_ConnectedToSmtp),
            $"{_options.Smtp.Host}:{_options.Smtp.Port}"], TaskStatus.Success, LogLevel.Debug);

        Task.Factory.StartNew(MailSenderWorker, _cancellationToken, TaskCreationOptions.LongRunning,
            TaskScheduler.Default);
    }

    public void Dispose()
    {
        if (_disposed)
            return;

        _disposed = true;
        _cancellationTokenSource.Cancel();
        _smtpClient?.Dispose();
        GC.SuppressFinalize(this);
    }

    public bool EnqueueMailContent(MailContent content)
    {
        if (_smtpClient is null)
        {
            _logger.LogWarning("SMTP is not configured; dropping mail for {Email}.", content.Email);
            return false;
        }

        if (string.IsNullOrWhiteSpace(content.Email))
        {
            _logger.LogWarning("Skipped mail with an empty recipient.");
            return false;
        }

        _mailQueue.Enqueue(content);
        _resetEvent.Set();
        return true;
    }

    public async Task SendMailContent(MailContent content)

    {
        // TODO: use GlobalConfig.DefaultEmailTemplate
        // TODO: use a string formatter library
        // TODO: update default template with new names
        var emailContent = new StringBuilder(content.Template)
            .Replace("{title}", content.Title)
            .Replace("{information}", content.Information)
            .Replace("{btnmsg}", content.ButtonMessage)
            .Replace("{email}", content.Email)
            .Replace("{userName}", content.UserName)
            .Replace("{url}", content.Url)
            .Replace("{nowtime}", content.Time)
            .Replace("{platform}", content.Platform)
            .ToString();

        var title = $"{content.Title} - {content.Platform}";

        var sender = string.IsNullOrWhiteSpace(_options!.SenderName) ? content.Platform : _options.SenderName;

        // SenderAddress is checked in constructor, so it won't be null here
        var from = new MailboxAddress(sender, _options.SenderAddress!);

        var to = new MailboxAddress(content.UserName, content.Email);

        if (!await SendEmailAsync(title, emailContent, from, to))
            _logger.SystemLog(StaticLocalizer[nameof(Resources.Program.MailSender_MailSendFailed)],
                TaskStatus.Failed);
    }

    public bool SendConfirmEmailUrl(string? userName, string? email, string? confirmLink,
        IStringLocalizer<Program> localizer, IOptionsSnapshot<GlobalConfig> options) =>
        EnqueueMailTask(userName, email, confirmLink, MailType.ConfirmEmail, localizer, options);

    public bool SendChangeEmailUrl(string? userName, string? email, string? resetLink,
        IStringLocalizer<Program> localizer, IOptionsSnapshot<GlobalConfig> options) =>
        EnqueueMailTask(userName, email, resetLink, MailType.ChangeEmail, localizer, options);

    public bool SendResetPasswordUrl(string? userName, string? email, string? resetLink,
        IStringLocalizer<Program> localizer, IOptionsSnapshot<GlobalConfig> options) =>
        EnqueueMailTask(userName, email, resetLink, MailType.ResetPassword, localizer, options);

    private async Task<bool> SendEmailAsync(string subject, string content, MailboxAddress from, MailboxAddress to)
    {
        if (_smtpClient is null)
            return false;

        using var msg = new MimeMessage();
        msg.From.Add(from);
        msg.To.Add(to);
        msg.Subject = subject;
        msg.Body = new TextPart(TextFormat.Html) { Text = content };

        try
        {
            await _smtpClient.SendAsync(msg, _cancellationToken);

            _logger.SystemLog(StaticLocalizer[nameof(Resources.Program.MailSender_SendMail), to],
                TaskStatus.Success, LogLevel.Information);
            return true;
        }
        catch (Exception e)
        {
            _logger.LogErrorMessage(e, StaticLocalizer[nameof(Resources.Program.MailSender_MailSendFailed)]);
            return false;
        }
    }

    private async Task MailSenderWorker()
    {
        if (_smtpClient is null)
            return;

        while (!_cancellationToken.IsCancellationRequested)
        {
            await _resetEvent.WaitAsync(_cancellationToken);
            _resetEvent.Reset();

            try
            {
                if (!_smtpClient.IsConnected)
                    await _smtpClient.ConnectAsync(_options!.Smtp!.Host, _options.Smtp.Port,
                        cancellationToken: _cancellationToken);

                if (_useSmtpAuthentication && !_smtpClient.IsAuthenticated)
                    await _smtpClient.AuthenticateAsync(_options!.UserName, _options.Password,
                        _cancellationToken);

                while (_mailQueue.TryDequeue(out var content))
                    await SendMailContent(content);
            }
            catch (Exception e)
            {
                // Failed to establish SMTP connection, clear the queue
                _mailQueue.Clear();

                _logger.LogErrorMessage(e, StaticLocalizer[nameof(Resources.Program.MailSender_MailSendFailed)]);
            }
            finally
            {
                await _smtpClient.DisconnectAsync(true, _cancellationToken);
            }
        }
    }

    private bool EnqueueMailTask(string? userName, string? email, string? resetLink, MailType type,
        IStringLocalizer<Program> localizer, IOptionsSnapshot<GlobalConfig> options)
    {
        if (_smtpClient is null)
            return false;

        if (string.IsNullOrEmpty(userName) || string.IsNullOrEmpty(email) || string.IsNullOrEmpty(resetLink))
        {
            _logger.SystemLog(StaticLocalizer[nameof(Resources.Program.MailSender_InvalidRequest)],
                TaskStatus.Failed);
            return false;
        }

        var content = new MailContent(userName, email, resetLink, type, localizer, options);

        return EnqueueMailContent(content);
    }

    private bool TestSmtpClient(CancellationToken token = default)
    {
        if (_smtpClient is null)
            return false;

        try
        {
            _smtpClient.Connect(_options!.Smtp!.Host, _options.Smtp.Port, cancellationToken: token);
            if (_useSmtpAuthentication)
                _smtpClient.Authenticate(_options.UserName, _options.Password, token);
            _smtpClient.Disconnect(true, token);
            return true;
        }
        catch (Exception e)
        {
            _logger.LogDebug(e, "{msg}",
                StaticLocalizer[nameof(Resources.Program.MailSender_MailSendFailed)]);
            return false;
        }
    }

    ~MailSender()
    {
        Dispose();
    }
}

/// <summary>
/// 邮件类型
/// </summary>
public enum MailType
{
    ConfirmEmail,
    ChangeEmail,
    ResetPassword
}

/// <summary>
/// 邮件内容
/// </summary>
public class MailContent
{
    private const string NotificationTemplate =
        "<head><meta content=\"text/html; charset=utf-8\" http-equiv=\"Content-Type\"/></head>" +
        "<body><div style=\"max-width: 544px; margin: 0 auto; padding: 20px\">" +
        "<h2 style=\"text-align: center\">{title}</h2>" +
        "<p>你好！</p>" +
        "<div>{information}</div>" +
        "<p style=\"font-size: 0.7em; text-align: right; color: #333\">{platform} @ {nowtime}</p>" +
        "</div></body>";

    public MailContent(string userName, string email, string resetLink, MailType type,
        // DO NOT use IStringLocalizer<Program> after construction
        IStringLocalizer<Program> localizer, IOptionsSnapshot<GlobalConfig> globalConfig)
    {
        Template = localizer[nameof(Resources.Program.MailSender_Template)];
        Title = type switch
        {
            MailType.ConfirmEmail => localizer[nameof(Resources.Program.MailSender_VerifyEmailTitle)],
            MailType.ChangeEmail => localizer[nameof(Resources.Program.MailSender_ChangeEmailTitle)],
            MailType.ResetPassword => localizer[nameof(Resources.Program.MailSender_ResetPasswordTitle)],
            _ => throw new ArgumentOutOfRangeException(nameof(type), type, null)
        };
        Information = type switch
        {
            MailType.ConfirmEmail => localizer[nameof(Resources.Program.MailSender_VerifyEmailContent), email],
            MailType.ChangeEmail => localizer[nameof(Resources.Program.MailSender_ChangeEmailContent)],
            MailType.ResetPassword => localizer[nameof(Resources.Program.MailSender_ResetPasswordContent)],
            _ => throw new ArgumentOutOfRangeException(nameof(type), type, null)
        };
        ButtonMessage = type switch
        {
            MailType.ConfirmEmail => localizer[nameof(Resources.Program.MailSender_VerifyEmailButton)],
            MailType.ChangeEmail => localizer[nameof(Resources.Program.MailSender_ChangeEmailButton)],
            MailType.ResetPassword => localizer[nameof(Resources.Program.MailSender_ResetPasswordButton)],
            _ => throw new ArgumentOutOfRangeException(nameof(type), type, null)
        };
        UserName = userName;
        Email = email;
        Url = resetLink;
        Time = DateTimeOffset.UtcNow.ToString("u");
        Platform = globalConfig.Value.Platform;
    }

    public MailContent(string userName, string email, string title, string information,
        IOptionsSnapshot<GlobalConfig> globalConfig)
    {
        Template = NotificationTemplate;
        Title = title;
        Information = information;
        ButtonMessage = string.Empty;
        UserName = userName;
        Email = email;
        Url = string.Empty;
        Time = DateTimeOffset.UtcNow.ToString("u");
        Platform = globalConfig.Value.Platform;
    }

    public string Template { get; }
    public string Title { get; }
    public string Information { get; }
    public string ButtonMessage { get; }
    public string UserName { get; }
    public string Email { get; }
    public string Url { get; }
    public string Time { get; }
    public string Platform { get; }
}
