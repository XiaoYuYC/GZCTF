using System.Data;
using System.Net;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;

using GZCTF.Controllers.Cyctf;
using GZCTF.Middlewares;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Models.Internal;
using GZCTF.Models.Request.Cyctf;
using GZCTF.Models.Request.Info;
using GZCTF.Models.Response.Cyctf;
using GZCTF.Repositories.Interface;
using GZCTF.Services;
using GZCTF.Services.Mail;
using GZCTF.Utils;

using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Options;

namespace GZCTF.Controllers.Cyctf;

/// <summary>
/// CYCTF 报名 API. 业务数据和 GZCTF 原生 Participation 使用同一 DbContext。
/// </summary>
[Route("api/cyctf/registrations")]
[ApiController]
public class RegistrationController(
    AppDbContext db,
    IDistributedCache cache,
    IRegistrationRepository registrationRepository,
    IGameRepository gameRepository,
    IGameExtensionRepository gameExtensionRepository,
    IDivisionExtensionRepository divisionExtensionRepository,
    IParticipationRepository participationRepository,
    ITeamRepository teamRepository,
    Microsoft.AspNetCore.Identity.UserManager<UserInfo> userManager,
    ICaptchaService captcha,
    IOptionsSnapshot<AccountPolicy> accountPolicy,
    IMailSender mailSender,
    IOptionsSnapshot<GlobalConfig> globalConfig,
    ILogger<RegistrationController> logger,
    IStringLocalizer<Program> localizer) : ControllerBase

{
    private const int MaxTeamsAllowed = 3;

    /// <summary>
    /// 报名（需要登录）
    /// </summary>
    [HttpPost]
    [Authorize]
    [EnableRateLimiting(nameof(RateLimiter.LimitPolicy.Register))]
    public async Task<IActionResult> RegisterTeam([FromBody] RegistrationRequest request, CancellationToken token)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null)
            return Unauthorized();

        if (!await userManager.IsEmailConfirmedAsync(user))
            return BadRequest(new RequestResponse(
                localizer[nameof(Resources.Program.Account_EmailNotConfirmed)],
                StatusCodes.Status400BadRequest));

        if (accountPolicy.Value.UseCaptcha && !await captcha.VerifyAsync(request, HttpContext, token))
            return BadRequest(new RequestResponse("人机验证失败", StatusCodes.Status400BadRequest));

        var game = await gameRepository.GetGameById(request.GameId, token);
        if (game is null)
            return NotFound(new RequestResponse("比赛不存在", StatusCodes.Status404NotFound));

        var extension = await gameExtensionRepository.GetGameExtensionByGameId(request.GameId, token);
        if (extension is null || extension.Deleted)
            return NotFound(new RequestResponse("比赛未启用 CYCTF 扩展", StatusCodes.Status404NotFound));

        var now = DateTimeOffset.UtcNow;
        if (now < extension.RegistrationStartTime)
            return BadRequest(new RequestResponse("报名尚未开始", StatusCodes.Status400BadRequest));
        if (now > extension.RegistrationEndTime)
            return BadRequest(new RequestResponse("报名已结束", StatusCodes.Status400BadRequest));

        if (!IsAllowedEmail(accountPolicy.Value.EmailDomainList, user.Email))
            return BadRequest(new RequestResponse("队长邮箱不在 GZCTF 邮箱域名白名单中"));

        var existingRegistration = await registrationRepository
            .GetActiveRegistrationByCaptainAndGame(user.Id, game.Id, token);
        if (existingRegistration is not null)
            return Ok(RegistrationResponse.FromEntity(existingRegistration));

        var teamName = request.TeamName?.Trim();
        if (string.IsNullOrWhiteSpace(teamName))
            return BadRequest(new RequestResponse("请填写队伍名称", StatusCodes.Status400BadRequest));
        var teamBio = string.IsNullOrWhiteSpace(request.TeamBio) ? null : request.TeamBio.Trim();

        var division = await db.Divisions.FirstOrDefaultAsync(d => d.Id == request.DivisionId &&
                                                                     d.GameId == request.GameId, token);
        if (division is null)
            return BadRequest(new RequestResponse("所选组别不属于该比赛"));
        if (!division.DefaultPermissions.HasFlag(GamePermission.JoinGame))
            return BadRequest(new RequestResponse("所选组别当前不接受报名"));

        var divisionExtension = await divisionExtensionRepository
            .GetDivisionExtensionByDivisionId(request.DivisionId, token);
        const int memberCount = 1;
        if (divisionExtension?.MinTeamSize is { } min && memberCount < min)
            return BadRequest(new RequestResponse($"该组别队伍人数不能少于 {min} 人"));
        if (divisionExtension?.MaxTeamSize is { } max && memberCount > max)
            return BadRequest(new RequestResponse($"该组别队伍人数不能超过 {max} 人"));

        if (extension.MaxTeams is { } maxTeams && extension.CurrentTeams >= maxTeams)
            return BadRequest(new RequestResponse("报名人数已满"));

        if (!TryValidateRegistrationData(request.FormData, null, divisionExtension?.RegistrationFields, out var formError))
            return BadRequest(new RequestResponse(formError!));

        var uniqueError = await FindUniqueRegistrationConflict(request, divisionExtension?.RegistrationFields, token);
        if (uniqueError is not null)
            return BadRequest(new RequestResponse(uniqueError));

        var captainTeamCount = await db.Teams.CountAsync(team => team.CaptainId == user.Id, token);
        if (captainTeamCount >= MaxTeamsAllowed)
            return BadRequest(new RequestResponse(localizer[nameof(Resources.Program.Team_ExceededCreationLimit)]));

        var hasMemberConflict = await db.UserParticipations
            .AnyAsync(item => item.GameId == game.Id && item.UserId == user.Id &&
                              item.Participation.Status != ParticipationStatus.Rejected, token);
        if (hasMemberConflict)
            return BadRequest(new RequestResponse("您已参加该比赛中的其他队伍"));

        var status = division.DefaultPermissions.HasFlag(GamePermission.RequireReview)
            ? "PENDING"
            : "APPROVED";

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(token);

            var concurrentRegistration = await registrationRepository
                .GetActiveRegistrationByCaptainAndGame(user.Id, game.Id, token);
            if (concurrentRegistration is not null)
                return Ok(RegistrationResponse.FromEntity(concurrentRegistration));

            var team = await teamRepository.CreateTeam(new TeamUpdateModel
            {
                Name = teamName,
                Bio = teamBio
            }, user, token);

            var registration = new Registration
            {
                GameId = game.Id,
                TeamId = team.Id,
                DivisionId = division.Id,
                Status = status,
                FormData = request.FormData,
                Deleted = false,
                Team = team,
                Division = division,
                UpdateTime = DateTimeOffset.UtcNow
            };
            await registrationRepository.CreateRegistration(registration, token);

            var participation = new Participation
            {
                Game = game,
                Team = team,
                Token = gameRepository.GetToken(game, team),
                Division = division,
                Status = ParticipationStatus.Pending
            };
            participation.Members.Add(new UserParticipation(user, game, team));
            db.Participations.Add(participation);
            await db.SaveChangesAsync(token);

            if (status == "APPROVED")
                await participationRepository.UpdateParticipationStatus(participation,
                    ParticipationStatus.Accepted, token);

            extension.CurrentTeams++;
            await gameExtensionRepository.UpdateCurrentTeams(game.Id, extension.CurrentTeams, token);
            await transaction.CommitAsync(token);
            QueueRegistrationNotification(game, team, division, status, null);

            return Ok(RegistrationResponse.FromEntity(registration));
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            var concurrentRegistration = await registrationRepository
                .GetActiveRegistrationByCaptainAndGame(user.Id, game.Id, token);
            if (concurrentRegistration is not null)
                return Ok(RegistrationResponse.FromEntity(concurrentRegistration));
            throw;
        }
    }

    /// <summary>
    /// 报名（无需登录，通过邮箱验证码）
    /// </summary>
    [AllowAnonymous]
    [HttpPost("no-auth")]
    [EnableRateLimiting(nameof(RateLimiter.LimitPolicy.Register))]
    public async Task<IActionResult> RegisterTeamNoAuth([FromBody] RegistrationRequest request, CancellationToken token)
    {
        // 验证邮箱和验证码
        if (string.IsNullOrWhiteSpace(request.CaptainEmail))
            return BadRequest(new RequestResponse("请填写队长邮箱", StatusCodes.Status400BadRequest));

        if (string.IsNullOrWhiteSpace(request.VerificationCode))
            return BadRequest(new RequestResponse("请填写验证码", StatusCodes.Status400BadRequest));

        var email = request.CaptainEmail.Trim().ToLowerInvariant();

        // 验证验证码
        if (!await VerificationController.VerifyCodeAsync(cache, email, request.VerificationCode, token))
            return BadRequest(new RequestResponse("验证码错误或已过期", StatusCodes.Status400BadRequest));

        // 验证图形验证码
        if (accountPolicy.Value.UseCaptcha && !await captcha.VerifyAsync(request, HttpContext, token))
            return BadRequest(new RequestResponse("人机验证失败", StatusCodes.Status400BadRequest));

        var game = await gameRepository.GetGameById(request.GameId, token);
        if (game is null)
            return NotFound(new RequestResponse("比赛不存在", StatusCodes.Status404NotFound));

        var extension = await gameExtensionRepository.GetGameExtensionByGameId(request.GameId, token);
        if (extension is null || extension.Deleted)
            return NotFound(new RequestResponse("比赛未启用 CYCTF 扩展", StatusCodes.Status404NotFound));

        var now = DateTimeOffset.UtcNow;
        if (now < extension.RegistrationStartTime)
            return BadRequest(new RequestResponse("报名尚未开始", StatusCodes.Status400BadRequest));
        if (now > extension.RegistrationEndTime)
            return BadRequest(new RequestResponse("报名已结束", StatusCodes.Status400BadRequest));

        if (!IsAllowedEmail(accountPolicy.Value.EmailDomainList, email))
            return BadRequest(new RequestResponse("队长邮箱不在 GZCTF 邮箱域名白名单中"));

        // 检查该邮箱是否已经报名过此比赛
        var existingByEmail = await registrationRepository.GetRegistrationByEmailAndGame(email, game.Id, token);
        if (existingByEmail is not null)
            return BadRequest(new RequestResponse("该邮箱已报名过此比赛", StatusCodes.Status400BadRequest));

        var teamName = request.TeamName?.Trim();
        if (string.IsNullOrWhiteSpace(teamName))
            return BadRequest(new RequestResponse("请填写队伍名称", StatusCodes.Status400BadRequest));
        var teamBio = string.IsNullOrWhiteSpace(request.TeamBio) ? null : request.TeamBio.Trim();

        var division = await db.Divisions.FirstOrDefaultAsync(d => d.Id == request.DivisionId &&
                                                                     d.GameId == request.GameId, token);
        if (division is null)
            return BadRequest(new RequestResponse("所选组别不属于该比赛"));
        if (!division.DefaultPermissions.HasFlag(GamePermission.JoinGame))
            return BadRequest(new RequestResponse("所选组别当前不接受报名"));

        // 检查队伍名是否已存在
        if (await registrationRepository.IsTeamNameExistsInGame(teamName, game.Id, token))
            return BadRequest(new RequestResponse("队伍名称已存在，请更换", StatusCodes.Status400BadRequest));

        var divisionExtension = await divisionExtensionRepository
            .GetDivisionExtensionByDivisionId(request.DivisionId, token);

        // 计算队伍总人数：队长 + 队员
        var members = request.Members ?? new List<MemberInfoRequest>();
        var memberCount = 1 + members.Count; // 队长 + 队员

        if (divisionExtension?.MinTeamSize is { } min && memberCount < min)
            return BadRequest(new RequestResponse($"该组别队伍人数不能少于 {min} 人"));
        if (divisionExtension?.MaxTeamSize is { } max && memberCount > max)
            return BadRequest(new RequestResponse($"该组别队伍人数不能超过 {max} 人"));

        // 检查队长和队员邮箱是否已在已通过的报名中
        if (await registrationRepository.IsEmailInApprovedRegistration(email, game.Id, token))
            return BadRequest(new RequestResponse("队长邮箱已参加过该比赛", StatusCodes.Status400BadRequest));

        foreach (var member in members)
        {
            var memberEmail = member.Email.Trim().ToLowerInvariant();
            if (memberEmail == email)
                return BadRequest(new RequestResponse("队员邮箱不能与队长邮箱相同", StatusCodes.Status400BadRequest));

            if (!IsAllowedEmail(accountPolicy.Value.EmailDomainList, memberEmail))
                return BadRequest(new RequestResponse($"队员邮箱 {member.Email} 不在白名单中"));

            if (await registrationRepository.IsEmailInApprovedRegistration(memberEmail, game.Id, token))
                return BadRequest(new RequestResponse($"队员邮箱 {member.Email} 已参加过该比赛", StatusCodes.Status400BadRequest));
        }

        if (extension.MaxTeams is { } maxTeams && extension.CurrentTeams >= maxTeams)
            return BadRequest(new RequestResponse("报名人数已满"));

        if (!TryValidateRegistrationData(request.FormData, request.Members, divisionExtension?.RegistrationFields, out var formError))
            return BadRequest(new RequestResponse(formError!));

        var uniqueError = await FindUniqueRegistrationConflict(request, divisionExtension?.RegistrationFields, token);
        if (uniqueError is not null)
            return BadRequest(new RequestResponse(uniqueError));

        var status = division.DefaultPermissions.HasFlag(GamePermission.RequireReview)
            ? "PENDING"
            : "APPROVED";

        try
        {
            await using var transaction = await db.Database.BeginTransactionAsync(token);

            // 再次检查并发
            var concurrentByEmail = await registrationRepository.GetRegistrationByEmailAndGame(email, game.Id, token);
            if (concurrentByEmail is not null)
                return BadRequest(new RequestResponse("该邮箱已报名过此比赛", StatusCodes.Status400BadRequest));

            // 生成确认令牌
            var confirmationToken = Guid.NewGuid().ToString("N");

            // 为每个队员生成邀请
            var invitations = new List<MemberInvitation>();
            foreach (var member in members)
            {
                var invitationToken = Guid.NewGuid().ToString("N");
                invitations.Add(new MemberInvitation
                {
                    Email = member.Email.Trim().ToLowerInvariant(),
                    Token = invitationToken,
                    Status = InvitationStatus.Pending,
                    MemberFields = member.MemberFields,
                    SentAt = DateTimeOffset.UtcNow
                });
            }

            var registration = new Registration
            {
                GameId = game.Id,
                TeamId = null, // 无需登录报名暂不创建队伍
                DivisionId = division.Id,
                Status = status,
                FormData = request.FormData,
                CaptainEmail = email,
                TeamName = teamName, // 保存队伍名称
                TeamBio = teamBio,
                MemberInvitations = invitations.Count > 0
                    ? System.Text.Json.JsonSerializer.Serialize(invitations)
                    : null,
                ConfirmationToken = confirmationToken,
                Deleted = false,
                Division = division,
                UpdateTime = DateTimeOffset.UtcNow
            };
            await registrationRepository.CreateRegistration(registration, token);

            extension.CurrentTeams++;
            await gameExtensionRepository.UpdateCurrentTeams(game.Id, extension.CurrentTeams, token);
            await transaction.CommitAsync(token);

            // 发送队长确认邮件
            QueueNoAuthRegistrationNotification(game, teamName, division, email, status);

            // 发送队员邀请邮件
            foreach (var invitation in invitations)
            {
                QueueMemberInvitationEmail(game, teamName, invitation.Email, invitation.Token);
            }

            return Ok(RegistrationResponse.FromEntity(registration));
        }
        catch (DbUpdateException)
        {
            db.ChangeTracker.Clear();
            var concurrentByEmail = await registrationRepository.GetRegistrationByEmailAndGame(email, game.Id, token);
            if (concurrentByEmail is not null)
                return BadRequest(new RequestResponse("该邮箱已报名过此比赛", StatusCodes.Status400BadRequest));
            throw;
        }
    }

    [AllowAnonymous]
    [HttpPost("query")]
    [EnableRateLimiting(nameof(RateLimiter.LimitPolicy.Register))]
    public async Task<IActionResult> QueryRegistration([FromBody] RegistrationQueryRequest request, CancellationToken token)
    {
        if (request.GameId <= 0)
            return BadRequest(new RequestResponse("比赛参数无效"));
        if (string.IsNullOrWhiteSpace(request.Email))
            return BadRequest(new RequestResponse("邮箱不能为空"));
        if (string.IsNullOrWhiteSpace(request.VerificationCode))
            return BadRequest(new RequestResponse("验证码不能为空"));

        var email = request.Email.Trim().ToLowerInvariant();
        if (!IsValidEmailAddress(email))
            return BadRequest(new RequestResponse("邮箱格式不正确"));

        if (!await VerificationController.VerifyCodeAsync(cache, email, request.VerificationCode, token))
            return BadRequest(new RequestResponse("验证码错误或已过期"));

        if (await gameRepository.GetGameById(request.GameId, token) is null)
            return NotFound(new RequestResponse("比赛不存在"));

        var registration = await registrationRepository.GetRegistrationByEmailAndGame(email, request.GameId, token);
        if (registration is null)
            return NotFound(new RequestResponse("未找到该邮箱对应的报名记录"));

        var accessToken = Guid.NewGuid().ToString("N");
        await cache.SetStringAsync(
            $"cyctf:registration-query:{accessToken}",
            $"{request.GameId}:{registration.Id}:{email}",
            new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(15) },
            token);

        var response = RegistrationQueryResponse.FromEntity(registration);
        response.AccessToken = accessToken;
        return Ok(response);
    }

    [AllowAnonymous]
    [HttpPost("refresh")]
    [EnableRateLimiting(nameof(RateLimiter.LimitPolicy.Register))]
    public async Task<IActionResult> RefreshRegistrationQuery(
        [FromBody] RegistrationQueryRefreshRequest request, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(request.AccessToken))
            return Unauthorized(new RequestResponse("查询授权无效"));

        var queryKey = $"cyctf:registration-query:{request.AccessToken}";
        var queryValue = await cache.GetStringAsync(queryKey, token);
        if (string.IsNullOrWhiteSpace(queryValue))
            return Unauthorized(new RequestResponse("查询授权已过期，请重新查询报名"));

        var parts = queryValue.Split(':', 3);
        if (parts.Length != 3 || !int.TryParse(parts[0], out var gameId) ||
            !int.TryParse(parts[1], out var registrationId))
            return Unauthorized(new RequestResponse("查询授权无效"));

        var registration = await registrationRepository.GetRegistrationById(registrationId, token);
        var captainEmail = registration?.CaptainEmail ?? registration?.Team?.Captain?.Email;
        if (registration is null || registration.GameId != gameId ||
            !string.Equals(captainEmail, parts[2], StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new RequestResponse("查询授权无效"));

        var response = RegistrationQueryResponse.FromEntity(registration);
        response.AccessToken = request.AccessToken;
        return Ok(response);
    }

    [AllowAnonymous]
    [HttpPost("{id:int}/captain-cancel")]
    [EnableRateLimiting(nameof(RateLimiter.LimitPolicy.Register))]
    public async Task<IActionResult> CaptainCancelRegistration(
        int id, [FromBody] RegistrationCaptainCancelRequest request, CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(request.AccessToken))
            return Unauthorized(new RequestResponse("查询授权无效"));

        var queryKey = $"cyctf:registration-query:{request.AccessToken}";
        var queryValue = await cache.GetStringAsync(queryKey, token);
        if (string.IsNullOrWhiteSpace(queryValue))
            return Unauthorized(new RequestResponse("查询授权已过期，请重新查询报名"));

        var parts = queryValue.Split(':', 3);
        if (parts.Length != 3 || !int.TryParse(parts[0], out var gameId) || !int.TryParse(parts[1], out var registrationId) ||
            registrationId != id)
            return Unauthorized(new RequestResponse("查询授权无效"));

        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, token);

        var registration = await registrationRepository.GetRegistrationById(id, token);
        var captainEmail = registration?.CaptainEmail ?? registration?.Team?.Captain?.Email;
        if (registration is null || registration.GameId != gameId ||
            !string.Equals(captainEmail, parts[2], StringComparison.OrdinalIgnoreCase))
            return Unauthorized(new RequestResponse("查询授权无效"));

        if (registration.Status == "APPROVED")
            return BadRequest(new RequestResponse("已审核通过的队伍只能由管理员解散"));
        if (registration.Status != "PENDING")
            return BadRequest(new RequestResponse("当前报名状态不允许队长解散"));

        var game = await gameRepository.GetGameById(registration.GameId, token);
        if (game is null)
            return NotFound(new RequestResponse("比赛不存在"));

        registration = await registrationRepository.UpdateRegistrationStatus(id, "CANCELLED", null, null, token) ?? registration;
        var extension = await gameExtensionRepository.GetGameExtensionByGameId(registration.GameId, token);
        if (extension is not null && extension.CurrentTeams > 0)
            await gameExtensionRepository.UpdateCurrentTeams(registration.GameId, extension.CurrentTeams - 1, token);

        await transaction.CommitAsync(token);
        await cache.RemoveAsync(queryKey, token);
        if (!string.IsNullOrWhiteSpace(captainEmail))
            QueueNoAuthCancellationNotification(game, captainEmail, registration.Division);

        return Ok(RegistrationQueryResponse.FromEntity(registration));
    }

    [HttpGet("games/{gameId:int}/mine")]
    [Authorize]
    public async Task<IActionResult> GetMyRegistration(int gameId, CancellationToken token)
    {
        var user = await userManager.GetUserAsync(User);
        if (user is null)
            return Unauthorized();

        if (await gameRepository.GetGameById(gameId, token) is null)
            return NotFound(new RequestResponse("比赛不存在", StatusCodes.Status404NotFound));

        var registration = await registrationRepository
            .GetActiveRegistrationByCaptainAndGame(user.Id, gameId, token);
        return registration is null
            ? NotFound(new RequestResponse("报名记录不存在", StatusCodes.Status404NotFound))
            : Ok(RegistrationResponse.FromEntity(registration));
    }

    [HttpGet("games/{gameId:int}")]
    [RequireAdmin]
    public async Task<IActionResult> GetGameRegistrations(
        int gameId, 
        [FromQuery] string? status,
        [FromQuery] bool? allMembersAccepted,
        CancellationToken token)
    {
        if (await gameRepository.GetGameById(gameId, token) is null)
            return NotFound(new RequestResponse("比赛不存在", StatusCodes.Status404NotFound));
        
        var registrations = await registrationRepository.GetRegistrationsByGameId(gameId, status, token);
        
        // 前端筛选：是否全部成员接受邀请
        if (allMembersAccepted.HasValue)
        {
            registrations = registrations
                .Where(r => RegistrationResponse.FromEntity(r).AllMembersAccepted == allMembersAccepted.Value)
                .ToList();
        }
        
        return Ok(registrations.Select(RegistrationResponse.FromEntity));
    }

    [HttpGet("games/{gameId:int}/teams/{teamId:int}")]
    [Authorize]
    public async Task<IActionResult> GetTeamRegistration(int gameId, int teamId, CancellationToken token)
    {
        var user = await userManager.GetUserAsync(User);
        var team = await teamRepository.GetTeamById(teamId, token);
        if (user is null || team is null || team.Members.All(m => m.Id != user.Id))
            return Forbid();
        var registration = await registrationRepository.GetRegistrationByTeamAndGame(teamId, gameId, token);
        return registration is null
            ? NotFound(new RequestResponse("报名记录不存在", StatusCodes.Status404NotFound))
            : Ok(RegistrationResponse.FromEntity(registration));
    }

    [HttpGet("{id:int}")]
    [RequireAdmin]
    public async Task<IActionResult> GetRegistration(int id, CancellationToken token)
    {
        var registration = await registrationRepository.GetRegistrationById(id, token);
        return registration is null
            ? NotFound(new RequestResponse("报名记录不存在", StatusCodes.Status404NotFound))
            : Ok(RegistrationResponse.FromEntity(registration));
    }

    [HttpPost("{id:int}/review")]
    [RequireAdmin]
    public async Task<IActionResult> ReviewRegistration(int id, [FromBody] RegistrationReviewRequest request,
        CancellationToken token)
    {
        var registration = await registrationRepository.GetRegistrationById(id, token);
        if (registration is null)
            return NotFound(new RequestResponse("报名记录不存在", StatusCodes.Status404NotFound));
        var wasCancelled = string.Equals(registration.Status, "CANCELLED", StringComparison.OrdinalIgnoreCase);
        if (!string.Equals(request.Status, "APPROVED", StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(request.Status, "REJECTED", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new RequestResponse("审核状态必须为 APPROVED 或 REJECTED"));

        var game = await gameRepository.GetGameById(registration.GameId, token);
        var division = await db.Divisions.FirstOrDefaultAsync(d => d.Id == registration.DivisionId &&
                                                                    d.GameId == registration.GameId,
            token);
        if (game is null || division is null)
            return NotFound(new RequestResponse("报名关联数据不存在"));

        // 无需登录报名：审核通过时自动创建账号和队伍
        if (!registration.TeamId.HasValue)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            Guid.TryParse(userId, out var reviewerId);

            // 拒绝时只更新状态
            if (string.Equals(request.Status, "REJECTED", StringComparison.OrdinalIgnoreCase))
            {
                registration = await registrationRepository.UpdateRegistrationStatus(id, request.Status, request.ReviewNote,
                    reviewerId == Guid.Empty ? null : reviewerId, token) ?? registration;
                
                // 发送拒绝通知邮件给队长
                if (!string.IsNullOrWhiteSpace(registration.CaptainEmail))
                {
                    QueueNoAuthRejectionNotification(game, registration.CaptainEmail, division, request.ReviewNote);
                }
                
                return Ok(RegistrationResponse.FromEntity(registration));
            }

            // 审核通过：创建队长和队员账号、创建队伍
            if (string.IsNullOrWhiteSpace(registration.CaptainEmail))
                return BadRequest(new RequestResponse("无登录报名缺少队长邮箱"));

            if (string.IsNullOrWhiteSpace(registration.TeamName))
                return BadRequest(new RequestResponse("无登录报名缺少队伍名称"));

            // 解析队员邀请
            List<MemberInvitation>? invitations = null;
            if (!string.IsNullOrEmpty(registration.MemberInvitations))
            {
                try
                {
                    invitations = JsonSerializer.Deserialize<List<MemberInvitation>>(registration.MemberInvitations);
                }
                catch
                {
                    return BadRequest(new RequestResponse("队员邀请数据格式错误"));
                }
            }

            // 验证所有队员邀请已接受
            if (invitations != null && invitations.Count > 0)
            {
                var notAccepted = invitations.Where(inv => 
                    inv.Status != InvitationStatus.Accepted)
                    .ToList();
                
                if (notAccepted.Count > 0)
                {
                    var notAcceptedEmails = string.Join(", ", notAccepted.Select(inv => inv.Email));
                    return BadRequest(new RequestResponse($"以下队员尚未接受邀请：{notAcceptedEmails}。请等待所有队员接受邀请后再审核通过。"));
                }
            }

            await using var approvalTransaction = await db.Database.BeginTransactionAsync(token);

            try
            {
                // 1. 创建队长账号
                var captainPassword = Codec.RandomPassword(16);
                var captain = new UserInfo
                {
                    UserName = registration.CaptainEmail.Split('@')[0],
                    Email = registration.CaptainEmail,
                    EmailConfirmed = true,
                    Role = Role.User
                };
                captain.UpdateByHttpContext(HttpContext);

                var captainResult = await userManager.CreateAsync(captain, captainPassword);
                if (!captainResult.Succeeded)
                {
                    await approvalTransaction.RollbackAsync(token);
                    return BadRequest(new RequestResponse($"创建队长账号失败: {string.Join(", ", captainResult.Errors.Select(e => e.Description))}"));
                }

                // 2. 创建队员账号
                var memberUsers = new List<(UserInfo user, string password)>();
                if (invitations != null && invitations.Any())
                {
                    foreach (var invitation in invitations)
                    {
                        var memberPassword = Codec.RandomPassword(16);
                        var member = new UserInfo
                        {
                            UserName = invitation.Email.Split('@')[0],
                            Email = invitation.Email,
                            EmailConfirmed = true,
                            Role = Role.User
                        };
                        member.UpdateByHttpContext(HttpContext);

                        var memberResult = await userManager.CreateAsync(member, memberPassword);
                        if (!memberResult.Succeeded)
                        {
                            await approvalTransaction.RollbackAsync(token);
                            return BadRequest(new RequestResponse($"创建队员账号失败 ({invitation.Email}): {string.Join(", ", memberResult.Errors.Select(e => e.Description))}"));
                        }

                        memberUsers.Add((member, memberPassword));
                    }
                }

                // 3. 创建队伍
                var teamModel = new TeamUpdateModel
                {
                    Name = registration.TeamName,
                    Bio = string.IsNullOrWhiteSpace(registration.TeamBio) ? $"{game.Title} 参赛队伍" : registration.TeamBio
                };
                var newTeam = await teamRepository.CreateTeam(teamModel, captain, token);
                if (newTeam is null)
                {
                    await approvalTransaction.RollbackAsync(token);
                    return BadRequest(new RequestResponse("创建队伍失败"));
                }

                // 4. 添加队员到队伍
                foreach (var (memberUser, _) in memberUsers)
                {
                    newTeam.Members.Add(memberUser);
                }
                await db.SaveChangesAsync(token);

                // 5. 创建 Participation 和 UserParticipation
                var newParticipation = new Participation
                {
                    Game = game,
                    Team = newTeam,
                    Division = division,
                    Status = ParticipationStatus.Accepted
                };
                await db.Participations.AddAsync(newParticipation, token);
                await db.SaveChangesAsync(token);

                var allUsers = new List<UserInfo> { captain };
                allUsers.AddRange(memberUsers.Select(m => m.user));

                foreach (var user in allUsers)
                {
                    var userParticipation = new UserParticipation
                    {
                        Game = game,
                        Team = newTeam,
                        User = user,
                        Participation = newParticipation
                    };
                    await db.UserParticipations.AddAsync(userParticipation, token);
                }
                await db.SaveChangesAsync(token);

                // 6. 更新报名记录关联队伍
                registration.TeamId = newTeam.Id;
                registration = await registrationRepository.UpdateRegistrationStatus(id, request.Status, request.ReviewNote,
                    reviewerId == Guid.Empty ? null : reviewerId, token) ?? registration;

                // 7. 取消状态曾释放名额，重新通过时恢复当前队伍数
                if (wasCancelled)
                {
                    var extension = await gameExtensionRepository.GetGameExtensionByGameId(registration.GameId, token);
                    if (extension is not null)
                        await gameExtensionRepository.UpdateCurrentTeams(registration.GameId, extension.CurrentTeams + 1, token);
                }

                await approvalTransaction.CommitAsync(token);

                // 8. 发送账号密码邮件
                QueueAccountCreationEmail(game, captain.Email, captain.UserName, captainPassword, registration.TeamName);
                foreach (var (memberUser, memberPassword) in memberUsers)
                {
                    QueueAccountCreationEmail(game, memberUser.Email, memberUser.UserName, memberPassword, registration.TeamName);
                }

                // 9. 处理邮箱冲突：从其他未审核报名中移除重复邮箱
                await HandleEmailConflicts(registration, allUsers.Select(u => u.Email).ToList(), token);

                return Ok(RegistrationResponse.FromEntity(registration));
            }
            catch (Exception ex)
            {
                await approvalTransaction.RollbackAsync(token);
                logger.LogError(ex, "审核无登录报名时发生异常");
                return StatusCode(StatusCodes.Status500InternalServerError,
                    new RequestResponse($"审核处理失败: {ex.Message}"));
            }
        }

        // 有队伍的报名需要更新 Participation
        var team = await teamRepository.GetTeamById(registration.TeamId.Value, token);
        if (team is null)
            return NotFound(new RequestResponse("报名关联队伍不存在"));

        var userId2 = User.FindFirstValue(ClaimTypes.NameIdentifier);
        Guid.TryParse(userId2, out var reviewerId2);
        await using var transaction = await db.Database.BeginTransactionAsync(token);

        var participation = await db.Participations
            .Include(p => p.Members)
            .FirstOrDefaultAsync(p => p.GameId == game.Id && p.TeamId == team.Id, token);
        if (participation is null)
            return BadRequest(new RequestResponse("报名缺少 GZCTF 参赛记录"));
        if (string.Equals(request.Status, "APPROVED", StringComparison.OrdinalIgnoreCase))
        {
            participation.Division = division;
            await participationRepository.UpdateParticipationStatus(participation,
                ParticipationStatus.Accepted, token);
        }
        else
        {
            await participationRepository.UpdateParticipationStatus(participation,
                ParticipationStatus.Rejected, token);
        }

        registration = await registrationRepository.UpdateRegistrationStatus(id, request.Status, request.ReviewNote,
            reviewerId2 == Guid.Empty ? null : reviewerId2, token) ?? registration;
        if (wasCancelled && string.Equals(request.Status, "APPROVED", StringComparison.OrdinalIgnoreCase))
        {
            var extension = await gameExtensionRepository.GetGameExtensionByGameId(registration.GameId, token);
            if (extension is not null)
                await gameExtensionRepository.UpdateCurrentTeams(registration.GameId, extension.CurrentTeams + 1, token);
        }

        await transaction.CommitAsync(token);
        QueueRegistrationNotification(game, team, division, registration.Status, registration.ReviewNote);
        return Ok(RegistrationResponse.FromEntity(registration));
    }

    [HttpPost("{id:int}/cancel")]
    [RequireAdmin]
    public async Task<IActionResult> CancelRegistration(int id, CancellationToken token)
    {
        var registration = await registrationRepository.GetRegistrationById(id, token);
        if (registration is null)
            return NotFound(new RequestResponse("报名记录不存在", StatusCodes.Status404NotFound));
        if (registration.Status == "CANCELLED")
            return Ok(RegistrationResponse.FromEntity(registration));

        var game = await gameRepository.GetGameById(registration.GameId, token);
        if (game is null)
            return NotFound(new RequestResponse("比赛不存在", StatusCodes.Status404NotFound));

        await using var transaction = await db.Database.BeginTransactionAsync(token);

        // 有队伍的报名需要取消 Participation
        if (registration.TeamId.HasValue)
        {
            var participation = await db.Participations
                .Include(p => p.Members)
                .FirstOrDefaultAsync(p => p.GameId == registration.GameId && p.TeamId == registration.TeamId.Value, token);
            if (participation is not null)
                await participationRepository.UpdateParticipationStatus(participation,
                    ParticipationStatus.Rejected, token);
        }

        registration = await registrationRepository.UpdateRegistrationStatus(id, "CANCELLED", null, null, token) ?? registration;
        var extension = await gameExtensionRepository.GetGameExtensionByGameId(registration.GameId, token);
        if (extension is not null && extension.CurrentTeams > 0)
            await gameExtensionRepository.UpdateCurrentTeams(registration.GameId, extension.CurrentTeams - 1, token);
        await transaction.CommitAsync(token);

        // 通知逻辑：有队伍用队伍通知，无队伍用邮箱通知
        if (registration.TeamId.HasValue && registration.Team is not null)
        {
            QueueRegistrationNotification(game, registration.Team, registration.Division, "CANCELLED", null);
        }
        else if (!string.IsNullOrWhiteSpace(registration.CaptainEmail))
        {
            QueueNoAuthCancellationNotification(game, registration.CaptainEmail, registration.Division);
        }

        return Ok(RegistrationResponse.FromEntity(registration));
    }

    [HttpGet("export")]
    [RequireAdmin]
    public async Task<IActionResult> Export([FromQuery] int? gameId, [FromQuery] string? status,
        CancellationToken token)
    {
        var bytes = await registrationRepository.ExportCsv(gameId, status, token);
        return File(bytes, "text/csv; charset=utf-8", "cyctf-registrations.csv");
    }

    [HttpGet("games/{gameId:int}/stats")]
    [RequireAdmin]
    public async Task<IActionResult> GetRegistrationStats(int gameId, CancellationToken token)
    {
        if (await gameRepository.GetGameById(gameId, token) is null)
            return NotFound(new RequestResponse("比赛不存在", StatusCodes.Status404NotFound));
        return Ok(await registrationRepository.GetRegistrationStats(gameId, token));
    }

    [HttpDelete("{id:int}")]
    [RequireAdmin]
    public async Task<IActionResult> DeleteRegistration(int id, CancellationToken token)
    {
        var registration = await registrationRepository.GetRegistrationById(id, token);
        if (registration is null)
            return NotFound(new RequestResponse("报名记录不存在", StatusCodes.Status404NotFound));

        var success = await registrationRepository.DeleteRegistration(id, token);
        if (!success)
            return NotFound(new RequestResponse("报名记录不存在", StatusCodes.Status404NotFound));

        return Ok(new RequestResponse("报名记录已删除", StatusCodes.Status200OK));
    }

    private void QueueNoAuthRegistrationNotification(Game game, string teamName, Division division, string email,
        string status)
    {
        var safeGame = WebUtility.HtmlEncode(game.Title);
        var safeTeam = WebUtility.HtmlEncode(teamName);
        var safeDivision = WebUtility.HtmlEncode(division.Name);

        var (title, information) = status switch
        {
            "APPROVED" => ("CYCTF 报名审核通过",
                $"队伍「{safeTeam}」已通过赛事「{safeGame}」的组别「{safeDivision}」报名审核。<br/><br/>" +
                "您可以进入报名查询页面查看最新报名状态。"),
            _ => ("CYCTF 报名已提交",
                $"队伍「{safeTeam}」已提交赛事「{safeGame}」的组别「{safeDivision}」报名，当前状态为待审核。<br/><br/>" +
                "您可以进入报名查询页面查看最新报名状态。")
        };

        try
        {
            var content = new MailContent(email, email, title, information, globalConfig);
            if (!mailSender.EnqueueMailContent(content))
                logger.LogWarning("CYCTF no-auth registration notification was not queued for email {Email}.", email);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to queue CYCTF no-auth registration notification for email {Email}.",
                email);
        }
    }

    private void QueueNoAuthCancellationNotification(Game game, string email, Division division)
    {
        var safeGame = WebUtility.HtmlEncode(game.Title);
        var safeDivision = WebUtility.HtmlEncode(division.Name);

        var title = "CYCTF 报名已取消";
        var information = $"您在赛事「{safeGame}」的组别「{safeDivision}」报名已被取消。";

        try
        {
            var content = new MailContent(email, email, title, information, globalConfig);
            if (!mailSender.EnqueueMailContent(content))
                logger.LogWarning("CYCTF no-auth cancellation notification was not queued for email {Email}.", email);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to queue CYCTF no-auth cancellation notification for email {Email}.",
                email);
        }
    }

    private void QueueMemberInvitationEmail(Game game, string teamName, string memberEmail, string invitationToken)
    {
        var safeGame = WebUtility.HtmlEncode(game.Title);
        var safeTeam = WebUtility.HtmlEncode(teamName);
        // 构造邀请处理链接；凭证只放在链接地址中，不在邮件正文展示。
        var request = HttpContext.Request;
        var scheme = request.Scheme;
        var host = request.Host.ToUriComponent();
        var invitationUrl = $"{scheme}://{host}/invitation/{invitationToken}";
        var safeUrl = WebUtility.HtmlEncode(invitationUrl);
        
        var title = "CYCTF 队伍邀请";
        var information = $"您被邀请加入队伍「{safeTeam}」参加赛事「{safeGame}」。<br/><br/>" +
                         $"<a href=\"{safeUrl}\" style=\"color: #1976d2; text-decoration: none;\">点击此处处理队伍邀请</a><br/><br/>" +
                         "请点击上方链接接受或拒绝邀请。如果您拒绝邀请，队长需要重新提交报名。";

        try
        {
            var content = new MailContent(memberEmail, memberEmail, title, information, globalConfig);
            if (!mailSender.EnqueueMailContent(content))
                logger.LogWarning("CYCTF member invitation was not queued for email {Email}.", memberEmail);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to queue CYCTF member invitation for email {Email}.", memberEmail);
        }
    }

    private void QueueNoAuthRejectionNotification(Game game, string email, Division? division, string? reviewNote)
    {
        var safeGame = WebUtility.HtmlEncode(game.Title);
        var safeDivision = division != null ? WebUtility.HtmlEncode(division.Name) : "未知组别";
        var safeNote = !string.IsNullOrWhiteSpace(reviewNote) ? WebUtility.HtmlEncode(reviewNote) : "无";
        
        var title = "CYCTF 报名审核结果";
        var information = $"您的报名申请「{safeGame} - {safeDivision}」已被拒绝。<br/><br/>" +
                         $"拒绝原因：{safeNote}<br/><br/>" +
                         "如有疑问，请联系管理员。";

        try
        {
            var content = new MailContent(email, email, title, information, globalConfig);
            if (!mailSender.EnqueueMailContent(content))
                logger.LogWarning("CYCTF no-auth rejection notification was not queued for email {Email}.", email);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to queue CYCTF no-auth rejection notification for email {Email}.", email);
        }
    }

    private void QueueAccountCreationEmail(Game game, string email, string username, string password, string teamName)
    {
        var safeGame = WebUtility.HtmlEncode(game.Title);
        var safeTeam = WebUtility.HtmlEncode(teamName);
        var safeUsername = WebUtility.HtmlEncode(username);
        var safePassword = WebUtility.HtmlEncode(password);
        
        var title = "CYCTF 账号创建通知";
        var information = $"恭喜！您的报名申请已通过审核。<br/><br/>" +
                         $"赛事：{safeGame}<br/>" +
                         $"队伍：{safeTeam}<br/><br/>" +
                         $"您的账号信息如下：<br/>" +
                         $"用户名：<strong>{safeUsername}</strong><br/>" +
                         $"密码：<strong>{safePassword}</strong><br/><br/>" +
                         "请妥善保管您的账号密码，登录后建议修改密码。";

        try
        {
            var content = new MailContent(email, email, title, information, globalConfig);
            if (!mailSender.EnqueueMailContent(content))
                logger.LogWarning("CYCTF account creation notification was not queued for email {Email}.", email);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to queue CYCTF account creation notification for email {Email}.", email);
        }
    }

    private async Task HandleEmailConflicts(Registration currentRegistration, List<string> emails, CancellationToken token)
    {
        try
        {
            // 规范化邮箱列表（小写）
            var normalizedEmails = emails.Select(e => e.Trim().ToLowerInvariant()).ToHashSet();
            
            // 获取所有待审核的报名记录
            var allRegistrations = await registrationRepository.GetRegistrationsByGameId(currentRegistration.GameId, "PENDING", token);
            
            foreach (var registration in allRegistrations)
            {
                // 跳过当前报名
                if (registration.Id == currentRegistration.Id)
                    continue;

                bool hasConflict = false;
                List<MemberInvitation>? invitations = null;
                List<string> conflictEmailsForThisReg = new();

                // 检查队长邮箱冲突
                if (!string.IsNullOrEmpty(registration.CaptainEmail))
                {
                    var normalizedCaptain = registration.CaptainEmail.Trim().ToLowerInvariant();
                    if (normalizedEmails.Contains(normalizedCaptain))
                    {
                        hasConflict = true;
                        conflictEmailsForThisReg.Add(registration.CaptainEmail);
                    }
                }

                // 检查队员邮箱冲突
                if (!string.IsNullOrEmpty(registration.MemberInvitations))
                {
                    try
                    {
                        invitations = JsonSerializer.Deserialize<List<MemberInvitation>>(registration.MemberInvitations);
                        if (invitations != null)
                        {
                            // 找出冲突的队员
                            var conflictingMembers = invitations
                                .Where(inv => normalizedEmails.Contains(inv.Email.Trim().ToLowerInvariant()))
                                .ToList();
                            
                            if (conflictingMembers.Any())
                            {
                                hasConflict = true;
                                conflictEmailsForThisReg.AddRange(conflictingMembers.Select(m => m.Email));
                                
                                // 从邀请列表中移除冲突的队员
                                var remainingInvitations = invitations
                                    .Where(inv => !normalizedEmails.Contains(inv.Email.Trim().ToLowerInvariant()))
                                    .ToList();
                                
                                // 更新邀请列表
                                registration.MemberInvitations = remainingInvitations.Any() 
                                    ? JsonSerializer.Serialize(remainingInvitations) 
                                    : null;
                                
                                await registrationRepository.UpdateRegistration(registration, token);
                            }
                        }
                    }
                    catch
                    {
                        // 解析失败，跳过
                    }
                }

                // 发送通知邮件给队长
                if (hasConflict && !string.IsNullOrEmpty(registration.CaptainEmail))
                {
                    var game = await gameRepository.GetGameById(registration.GameId, token);
                    if (game != null)
                    {
                        QueueConflictNotificationEmail(game, registration.CaptainEmail, conflictEmailsForThisReg);
                    }
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "处理邮箱冲突时发生异常");
        }
    }

    private void QueueConflictNotificationEmail(Game game, string captainEmail, List<string> conflictEmails)
    {
        var safeGame = WebUtility.HtmlEncode(game.Title);
        var safeEmails = string.Join("、", conflictEmails.Select(WebUtility.HtmlEncode));
        
        var title = "CYCTF 报名队员冲突通知";
        var information = $"您的报名申请「{safeGame}」中的以下队员邮箱已被其他已通过的报名使用：<br/><br/>" +
                         $"{safeEmails}<br/><br/>" +
                         "这些队员已从您的报名中移除，请重新提交报名。";

        try
        {
            var content = new MailContent(captainEmail, captainEmail, title, information, globalConfig);
            if (!mailSender.EnqueueMailContent(content))
                logger.LogWarning("CYCTF conflict notification was not queued for email {Email}.", captainEmail);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to queue CYCTF conflict notification for email {Email}.", captainEmail);
        }
    }

    private void QueueRegistrationNotification(Game game, Team team, Division division, string status,
        string? reviewNote)
    {
        var captain = team.Members.FirstOrDefault(member => member.Id == team.CaptainId);
        var email = captain?.Email;
        if (captain is null || string.IsNullOrWhiteSpace(email))
        {
            logger.LogWarning("CYCTF registration notification skipped for team {TeamId}: captain email is missing.",
                team.Id);
            return;
        }

        var safeGame = WebUtility.HtmlEncode(game.Title);
        var safeTeam = WebUtility.HtmlEncode(team.Name);
        var safeDivision = WebUtility.HtmlEncode(division.Name);
        var safeNote = WebUtility.HtmlEncode(reviewNote ?? string.Empty);
        var (title, information) = status switch
        {
            "APPROVED" => ("CYCTF 报名审核通过",
                $"队伍「{safeTeam}」已通过赛事「{safeGame}」的组别「{safeDivision}」报名审核。"),
            "REJECTED" => ("CYCTF 报名审核未通过",
                $"队伍「{safeTeam}」未通过赛事「{safeGame}」的组别「{safeDivision}」报名审核。" +
                (string.IsNullOrWhiteSpace(safeNote) ? string.Empty : $"<br/>审核备注：{safeNote}")),
            "CANCELLED" => ("CYCTF 报名已取消",
                $"队伍「{safeTeam}」在赛事「{safeGame}」的组别「{safeDivision}」报名已取消。"),
            _ => ("CYCTF 报名已提交",
                $"队伍「{safeTeam}」已提交赛事「{safeGame}」的组别「{safeDivision}」报名，当前状态为待审核。")
        };

        try
        {
            var content = new MailContent(captain.UserName ?? email!, email!, title, information, globalConfig);
            if (!mailSender.EnqueueMailContent(content))
                logger.LogWarning("CYCTF registration notification was not queued for team {TeamId}.", team.Id);
        }
        catch (Exception exception)
        {
            logger.LogError(exception, "Failed to queue CYCTF registration notification for team {TeamId}.", team.Id);
        }
    }

    private static bool IsValidEmailAddress(string email)
    {
        try
        {
            var address = new System.Net.Mail.MailAddress(email);
            return string.Equals(address.Address, email, StringComparison.OrdinalIgnoreCase) && email.Contains('@');
        }
        catch
        {
            return false;
        }
    }

    private static bool IsAllowedEmail(string? domainList, string? email)
    {
        if (string.IsNullOrWhiteSpace(email))
            return false;
        if (string.IsNullOrWhiteSpace(domainList))
            return true;

        var normalizedEmail = email.Trim();
        var separator = normalizedEmail.LastIndexOf('@');
        if (separator < 1 || separator == normalizedEmail.Length - 1)
            return false;

        var domain = normalizedEmail[(separator + 1)..];
        return domainList
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(item => item.Trim().TrimStart('@'))
            .Any(item => string.Equals(item, domain, StringComparison.OrdinalIgnoreCase));
    }

    private readonly record struct RegistrationFieldDefinition(
        string Name,
        string Label,
        string Scope,
        bool Required,
        bool Unique,
        string Pattern);

    private static bool TryValidateRegistrationData(
        string? formData,
        List<MemberInfoRequest>? members,
        string? fieldSchema,
        out string? error)
    {
        error = null;
        try
        {
            using var formDocument = JsonDocument.Parse(string.IsNullOrWhiteSpace(formData) ? "{}" : formData);
            if (formDocument.RootElement.ValueKind != JsonValueKind.Object)
            {
                error = "报名表单数据必须是 JSON 对象";
                return false;
            }

            if (string.IsNullOrWhiteSpace(fieldSchema))
                return true;

            using var schemaDocument = JsonDocument.Parse(fieldSchema);
            if (schemaDocument.RootElement.ValueKind is not (JsonValueKind.Array or JsonValueKind.Object))
            {
                error = "报名字段配置必须是 JSON 数组或对象";
                return false;
            }

            var fields = GetFieldDefinitions(schemaDocument.RootElement).ToList();
            foreach (var field in fields)
            {
                if (!ValidateFieldValue(formDocument.RootElement, field, "队长", out error))
                    return false;

                if (!string.Equals(field.Scope, "member", StringComparison.OrdinalIgnoreCase))
                    continue;

                for (var index = 0; index < (members?.Count ?? 0); index++)
                {
                    var member = members![index];
                    using var memberDocument = JsonDocument.Parse(
                        string.IsNullOrWhiteSpace(member.MemberFields) ? "{}" : member.MemberFields);
                    if (memberDocument.RootElement.ValueKind != JsonValueKind.Object)
                    {
                        error = $"队员 {index + 1} 的报名字段数据必须是 JSON 对象";
                        return false;
                    }

                    if (!ValidateFieldValue(memberDocument.RootElement, field, $"队员 {index + 1}", out error))
                        return false;
                }
            }

            return true;
        }
        catch (JsonException)
        {
            error = "报名表单数据或字段配置不是有效 JSON";
            return false;
        }
    }

    private static bool ValidateFieldValue(
        JsonElement form,
        RegistrationFieldDefinition field,
        string subject,
        out string? error)
    {
        error = null;
        if (!TryGetPropertyIgnoreCase(form, field.Name, out var value) || IsEmptyValue(value))
        {
            if (field.Required)
                error = $"{subject}的报名字段「{field.Label}」不能为空";
            return !field.Required;
        }

        if (string.IsNullOrWhiteSpace(field.Pattern))
            return true;

        try
        {
            var text = GetValidationText(value);
            if (!Regex.IsMatch(text, field.Pattern, RegexOptions.CultureInvariant,
                    TimeSpan.FromMilliseconds(250)))
            {
                error = $"{subject}的报名字段「{field.Label}」格式不正确";
                return false;
            }
        }
        catch (ArgumentException)
        {
            error = $"报名字段「{field.Label}」的内容正则无效";
            return false;
        }
        catch (RegexMatchTimeoutException)
        {
            error = $"报名字段「{field.Label}」的内容正则执行超时";
            return false;
        }

        return true;
    }

    private async Task<string?> FindUniqueRegistrationConflict(
        RegistrationRequest request,
        string? fieldSchema,
        CancellationToken token)
    {
        if (string.IsNullOrWhiteSpace(fieldSchema))
            return null;

        using var schemaDocument = JsonDocument.Parse(fieldSchema);
        var uniqueFields = GetFieldDefinitions(schemaDocument.RootElement)
            .Where(field => field.Unique)
            .ToList();
        if (uniqueFields.Count == 0)
            return null;

        var existingRegistrations = await registrationRepository.GetRegistrationsByGameId(request.GameId, token: token);
        foreach (var field in uniqueFields)
        {
            var submittedValues = GetRequestFieldValues(request, field).ToList();
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var value in submittedValues)
            {
                if (!seen.Add(value))
                    return $"报名字段「{field.Label}」的内容不能重复";
            }

            foreach (var registration in existingRegistrations.Where(item =>
                         item.Status is not ("REJECTED" or "CANCELLED")))
            {
                IEnumerable<string> existingValues;
                try
                {
                    existingValues = GetRegistrationFieldValues(registration, field).ToList();
                }
                catch (JsonException)
                {
                    continue;
                }

                if (submittedValues.Any(value => existingValues.Contains(value, StringComparer.OrdinalIgnoreCase)))
                    return $"报名字段「{field.Label}」的内容已被其他报名使用";
            }
        }

        return null;
    }

    private static IEnumerable<string> GetRequestFieldValues(
        RegistrationRequest request,
        RegistrationFieldDefinition field)
    {
        using var formDocument = JsonDocument.Parse(string.IsNullOrWhiteSpace(request.FormData) ? "{}" : request.FormData);
        foreach (var value in GetFieldValues(formDocument.RootElement, field.Name))
            yield return NormalizeUniqueValue(value);

        if (!string.Equals(field.Scope, "member", StringComparison.OrdinalIgnoreCase))
            yield break;

        foreach (var member in request.Members ?? [])
        {
            using var memberDocument = JsonDocument.Parse(
                string.IsNullOrWhiteSpace(member.MemberFields) ? "{}" : member.MemberFields);
            foreach (var value in GetFieldValues(memberDocument.RootElement, field.Name))
                yield return NormalizeUniqueValue(value);
        }
    }

    private static IEnumerable<string> GetRegistrationFieldValues(
        Registration registration,
        RegistrationFieldDefinition field)
    {
        using var formDocument = JsonDocument.Parse(string.IsNullOrWhiteSpace(registration.FormData) ? "{}" : registration.FormData);
        foreach (var value in GetFieldValues(formDocument.RootElement, field.Name))
            yield return NormalizeUniqueValue(value);

        if (!string.Equals(field.Scope, "member", StringComparison.OrdinalIgnoreCase) ||
            string.IsNullOrWhiteSpace(registration.MemberInvitations))
            yield break;

        List<MemberInvitation>? invitations;
        try
        {
            invitations = JsonSerializer.Deserialize<List<MemberInvitation>>(registration.MemberInvitations);
        }
        catch (JsonException)
        {
            yield break;
        }

        foreach (var invitation in invitations ?? [])
        {
            using var memberDocument = JsonDocument.Parse(
                string.IsNullOrWhiteSpace(invitation.MemberFields) ? "{}" : invitation.MemberFields);
            foreach (var value in GetFieldValues(memberDocument.RootElement, field.Name))
                yield return NormalizeUniqueValue(value);
        }
    }

    private static IEnumerable<string> GetFieldValues(JsonElement form, string name)
    {
        if (TryGetPropertyIgnoreCase(form, name, out var value) && !IsEmptyValue(value))
            yield return GetValidationText(value);
    }

    private static string NormalizeUniqueValue(string value) => value.Trim();

    private static string GetValidationText(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => value.GetString() ?? string.Empty,
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        _ => value.GetRawText()
    };

    private static IEnumerable<RegistrationFieldDefinition> GetFieldDefinitions(JsonElement schema)
    {
        if (schema.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in schema.EnumerateArray())
            {
                if (item.ValueKind != JsonValueKind.Object)
                    continue;
                if (TryGetPropertyIgnoreCase(item, "fieldName", out var fieldName) ||
                    TryGetPropertyIgnoreCase(item, "name", out fieldName) ||
                    TryGetPropertyIgnoreCase(item, "key", out fieldName))
                {
                    var name = fieldName.GetString();
                    if (!string.IsNullOrWhiteSpace(name))
                        yield return CreateFieldDefinition(name, item);
                }
            }

            yield break;
        }

        if (TryGetPropertyIgnoreCase(schema, "fields", out var fields) &&
            fields.ValueKind == JsonValueKind.Array)
        {
            foreach (var field in GetFieldDefinitions(fields))
                yield return field;
            yield break;
        }

        foreach (var property in schema.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.Object)
                continue;
            yield return CreateFieldDefinition(property.Name, property.Value);
        }
    }

    private static RegistrationFieldDefinition CreateFieldDefinition(string name, JsonElement field)
    {
        var label = GetStringProperty(field, "label") ?? name;
        var scope = GetStringProperty(field, "scope") is { } rawScope &&
                    (string.Equals(rawScope, "member", StringComparison.OrdinalIgnoreCase) ||
                     string.Equals(rawScope, "player", StringComparison.OrdinalIgnoreCase))
            ? "member"
            : "team";
        return new RegistrationFieldDefinition(
            name.Trim(),
            label.Trim(),
            scope,
            GetBooleanProperty(field, "required"),
            GetBooleanProperty(field, "unique"),
            GetStringProperty(field, "pattern") ?? string.Empty);
    }

    private static string? GetStringProperty(JsonElement element, string name)
    {
        return TryGetPropertyIgnoreCase(element, name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;
    }

    private static bool GetBooleanProperty(JsonElement element, string name)
    {
        return TryGetPropertyIgnoreCase(element, name, out var value) && value.ValueKind == JsonValueKind.True;
    }

    private static bool IsEmptyValue(JsonElement value) =>
        value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined ||
        (value.ValueKind == JsonValueKind.String && string.IsNullOrWhiteSpace(value.GetString()));

    private static bool TryGetPropertyIgnoreCase(JsonElement element, string name, out JsonElement value)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
                {
                    value = property.Value;
                    return true;
                }
            }
        }

        value = default;
        return false;
    }
}
