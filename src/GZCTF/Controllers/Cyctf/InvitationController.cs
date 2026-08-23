using System.Text.Json;
using GZCTF.Controllers.Cyctf;
using GZCTF.Middlewares;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Models.Internal;
using GZCTF.Models.Response.Cyctf;
using GZCTF.Repositories.Interface;
using GZCTF.Services.Mail;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;

namespace GZCTF.Controllers.Cyctf;

/// <summary>
/// CYCTF 队员邀请控制器（公开接口，无需登录）
/// </summary>
[ApiController]
[Route("api/cyctf/invitations")]
[ProducesResponseType(typeof(RequestResponse), StatusCodes.Status400BadRequest)]
[ProducesResponseType(typeof(RequestResponse), StatusCodes.Status401Unauthorized)]
public class InvitationController(
    IRegistrationRepository registrationRepository,
    IGameRepository gameRepository,
    IMailSender mailSender,
    IOptionsSnapshot<GlobalConfig> globalConfig,
    ILogger<InvitationController> logger) : ControllerBase
{
    /// <summary>
    /// 获取邀请详情
    /// </summary>
    /// <param name="token">邀请令牌</param>
    /// <param name="cancellationToken"></param>
    /// <returns></returns>
    [HttpGet("{token}")]
    [ProducesResponseType(typeof(InvitationDetailResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetInvitationDetail([FromRoute] string token, CancellationToken cancellationToken = default)
    {
        // 查找包含此 token 的报名记录
        var registration = await registrationRepository.GetRegistrationByInvitationToken(token, cancellationToken);
        
        if (registration is null)
            return NotFound(new RequestResponse("邀请令牌无效或已过期"));

        var game = await gameRepository.GetGameById(registration.GameId, cancellationToken);
        if (game is null)
            return NotFound(new RequestResponse("比赛不存在"));

        // 解析 MemberInvitations JSON
        var invitations = string.IsNullOrEmpty(registration.MemberInvitations)
            ? []
            : JsonSerializer.Deserialize<List<MemberInvitation>>(registration.MemberInvitations) ?? [];

        var invitation = invitations.FirstOrDefault(inv => inv.Token == token);
        if (invitation is null)
            return NotFound(new RequestResponse("邀请令牌无效"));

        return Ok(new InvitationDetailResponse
        {
            Token = invitation.Token,
            Email = invitation.Email,
            Status = invitation.Status,
            GameTitle = game.Title,
            TeamName = registration.TeamName ?? "未命名队伍",
            CaptainEmail = registration.CaptainEmail ?? string.Empty,
            RegistrationStatus = registration.Status,
            SentAt = invitation.SentAt,
            RespondedAt = invitation.RespondedAt
        });
    }

    /// <summary>
    /// 接受邀请
    /// </summary>
    /// <param name="token">邀请令牌</param>
    /// <param name="cancellationToken"></param>
    /// <returns></returns>
    [HttpPost("{token}/accept")]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> AcceptInvitation([FromRoute] string token, CancellationToken cancellationToken = default)
    {
        var registration = await registrationRepository.GetRegistrationByInvitationToken(token, cancellationToken);
        
        if (registration is null)
            return NotFound(new RequestResponse("邀请令牌无效或已过期"));

        // 只有 PENDING 状态的报名才能接受邀请
        if (registration.Status != "PENDING")
            return BadRequest(new RequestResponse("该报名已被审核或取消，邀请已失效"));

        // 解析并更新邀请状态
        var invitations = string.IsNullOrEmpty(registration.MemberInvitations)
            ? []
            : JsonSerializer.Deserialize<List<MemberInvitation>>(registration.MemberInvitations) ?? [];

        var invitation = invitations.FirstOrDefault(inv => inv.Token == token);
        if (invitation is null)
            return NotFound(new RequestResponse("邀请令牌无效"));

        if (invitation.Status == InvitationStatus.Accepted)
            return BadRequest(new RequestResponse("您已接受该邀请"));

        if (invitation.Status == InvitationStatus.Rejected)
            return BadRequest(new RequestResponse("您已拒绝该邀请，队长需要重新提交报名"));

        // 更新状态
        invitation.Status = InvitationStatus.Accepted;
        invitation.RespondedAt = DateTimeOffset.UtcNow;

        registration.MemberInvitations = JsonSerializer.Serialize(invitations);
        await registrationRepository.UpdateRegistration(registration, cancellationToken);
        await registrationRepository.SaveAsync(cancellationToken);

        logger.LogInformation("Member {Email} accepted invitation {Token} for registration {RegistrationId}", 
            invitation.Email, token, registration.Id);

        return Ok(new RequestResponse("您已成功接受邀请，请等待队长提交报名并由管理员审核"));
    }

    /// <summary>
    /// 拒绝邀请
    /// </summary>
    /// <param name="token">邀请令牌</param>
    /// <param name="cancellationToken"></param>
    /// <returns></returns>
    [HttpPost("{token}/reject")]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> RejectInvitation([FromRoute] string token, CancellationToken cancellationToken = default)
    {
        var registration = await registrationRepository.GetRegistrationByInvitationToken(token, cancellationToken);
        
        if (registration is null)
            return NotFound(new RequestResponse("邀请令牌无效或已过期"));

        // 只有 PENDING 状态的报名才能拒绝邀请
        if (registration.Status != "PENDING")
            return BadRequest(new RequestResponse("该报名已被审核或取消，邀请已失效"));

        var invitations = string.IsNullOrEmpty(registration.MemberInvitations)
            ? []
            : JsonSerializer.Deserialize<List<MemberInvitation>>(registration.MemberInvitations) ?? [];

        var invitation = invitations.FirstOrDefault(inv => inv.Token == token);
        if (invitation is null)
            return NotFound(new RequestResponse("邀请令牌无效"));

        if (invitation.Status == InvitationStatus.Rejected)
            return BadRequest(new RequestResponse("您已拒绝该邀请"));

        if (invitation.Status == InvitationStatus.Accepted)
            return BadRequest(new RequestResponse("您已接受该邀请，无法再拒绝"));

        // 更新状态
        invitation.Status = InvitationStatus.Rejected;
        invitation.RespondedAt = DateTimeOffset.UtcNow;

        registration.MemberInvitations = JsonSerializer.Serialize(invitations);
        await registrationRepository.UpdateRegistration(registration, cancellationToken);
        await registrationRepository.SaveAsync(cancellationToken);

        logger.LogInformation("Member {Email} rejected invitation {Token} for registration {RegistrationId}", 
            invitation.Email, token, registration.Id);

        // 通知队长
        var game = await gameRepository.GetGameById(registration.GameId, cancellationToken);
        if (game != null)
        {
            QueueCaptainNotificationEmail(game, registration.CaptainEmail ?? string.Empty, invitation.Email);
        }

        return Ok(new RequestResponse("您已拒绝该邀请，队长将收到通知并需要重新提交报名"));
    }

    private void QueueCaptainNotificationEmail(Game game, string captainEmail, string memberEmail)
    {
        var safeGame = System.Net.WebUtility.HtmlEncode(game.Title);
        var safeMember = System.Net.WebUtility.HtmlEncode(memberEmail);
        
        var title = "CYCTF 队员拒绝邀请通知";
        var information = $"您的报名邀请被队员「{safeMember}」拒绝。<br/><br/>" +
                         $"比赛：{safeGame}<br/>" +
                         "请重新提交报名或调整队员名单。";

        try
        {
            var content = new MailContent(captainEmail, captainEmail, title, information, globalConfig);
            if (!mailSender.EnqueueMailContent(content))
                logger.LogWarning("Captain notification was not queued for email {Email}.", captainEmail);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to queue captain notification for email {Email}.", captainEmail);
        }
    }
}
