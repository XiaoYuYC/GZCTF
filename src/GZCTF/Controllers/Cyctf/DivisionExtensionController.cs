using GZCTF.Middlewares;
using GZCTF.Models.Request.Cyctf;
using System.Text.Json;
using System.Text.RegularExpressions;
using GZCTF.Models.Response.Cyctf;
using GZCTF.Repositories.Interface;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Localization;

namespace GZCTF.Controllers.Cyctf;

/// <summary>
/// CYCTF 组别扩展 API
/// </summary>
[Route("api/cyctf/divisions/{divisionId:int}/extension")]
[ApiController]
public class DivisionExtensionController(
    IDivisionExtensionRepository divisionExtensionRepository,
    IDivisionRepository divisionRepository,
    IStringLocalizer<Program> localizer) : ControllerBase
{
    /// <summary>
    /// 获取组别扩展信息
    /// </summary>
    /// <param name="divisionId">组别 ID</param>
    /// <param name="token"></param>
    /// <response code="200">成功获取组别扩展信息</response>
    /// <response code="404">组别或扩展信息不存在</response>
    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DivisionExtensionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetDivisionExtension(int divisionId, CancellationToken token)
    {
        var extension = await divisionExtensionRepository.GetDivisionExtensionByDivisionId(divisionId, token);
        if (extension is null)
            return NotFound(new RequestResponse("组别扩展信息不存在", StatusCodes.Status404NotFound));

        return Ok(DivisionExtensionResponse.FromEntity(extension));
    }

    /// <summary>
    /// 创建或更新组别扩展信息
    /// </summary>
    /// <param name="divisionId">组别 ID</param>
    /// <param name="request">扩展信息请求</param>
    /// <param name="token"></param>
    /// <response code="200">成功创建或更新组别扩展信息</response>
    /// <response code="404">组别不存在</response>
    [HttpPut]
    [RequireAdmin]
    [ProducesResponseType(typeof(DivisionExtensionResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> CreateOrUpdateDivisionExtension(int divisionId, [FromBody] DivisionExtensionRequest request, CancellationToken token)
    {
        if (!TryValidateRegistrationFieldPatterns(request.RegistrationFields, out var patternError))
            return BadRequest(new RequestResponse(patternError!));

        var extension = new Models.Data.Cyctf.DivisionExtension
        {
            DivisionId = divisionId,
            MinTeamSize = request.MinTeamSize,
            MaxTeamSize = request.MaxTeamSize,
            RegistrationFields = request.RegistrationFields
        };

        var result = await divisionExtensionRepository.CreateOrUpdateDivisionExtension(extension, token);
        return Ok(DivisionExtensionResponse.FromEntity(result));
    }

    private static bool TryValidateRegistrationFieldPatterns(string? raw, out string? error)
    {
        error = null;
        if (string.IsNullOrWhiteSpace(raw))
            return true;

        try
        {
            using var document = JsonDocument.Parse(raw);
            foreach (var field in GetRegistrationFieldObjects(document.RootElement))
            {
                if (!TryGetPropertyIgnoreCase(field, "pattern", out var pattern) ||
                    pattern.ValueKind != JsonValueKind.String ||
                    string.IsNullOrWhiteSpace(pattern.GetString()))
                    continue;

                try
                {
                    _ = new Regex(pattern.GetString()!, RegexOptions.CultureInvariant,
                        TimeSpan.FromMilliseconds(250));
                }
                catch (ArgumentException)
                {
                    var label = GetStringProperty(field, "label") ?? "未命名字段";
                    error = $"字段“{label}”的内容正则无效";
                    return false;
                }
            }

            return true;
        }
        catch (JsonException)
        {
            error = "报名字段配置不是有效 JSON";
            return false;
        }
    }

    private static IEnumerable<JsonElement> GetRegistrationFieldObjects(JsonElement schema)
    {
        if (schema.ValueKind == JsonValueKind.Array)
        {
            foreach (var field in schema.EnumerateArray())
            {
                if (field.ValueKind == JsonValueKind.Object)
                    yield return field;
            }

            yield break;
        }

        if (schema.ValueKind != JsonValueKind.Object)
            yield break;

        if (TryGetPropertyIgnoreCase(schema, "fields", out var fields) && fields.ValueKind == JsonValueKind.Array)
        {
            foreach (var field in GetRegistrationFieldObjects(fields))
                yield return field;
            yield break;
        }

        foreach (var property in schema.EnumerateObject())
        {
            if (property.Value.ValueKind == JsonValueKind.Object)
                yield return property.Value;
        }
    }

    private static string? GetStringProperty(JsonElement element, string name) =>
        TryGetPropertyIgnoreCase(element, name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

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

    /// <summary>
    /// 删除组别扩展信息
    /// </summary>
    /// <param name="divisionId">组别 ID</param>
    /// <param name="token"></param>
    /// <response code="200">成功删除组别扩展信息</response>
    /// <response code="404">组别或扩展信息不存在</response>
    [HttpDelete]
    [RequireAdmin]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(RequestResponse), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteDivisionExtension(int divisionId, CancellationToken token)
    {
        var success = await divisionExtensionRepository.DeleteDivisionExtension(divisionId, token);
        if (!success)
            return NotFound(new RequestResponse("组别扩展信息不存在", StatusCodes.Status404NotFound));

        return Ok(new RequestResponse("成功删除组别扩展信息", StatusCodes.Status200OK));
    }

    /// <summary>
    /// 获取比赛下所有组别的扩展信息
    /// </summary>
    /// <param name="gameId">比赛 ID</param>
    /// <param name="token"></param>
    /// <response code="200">成功获取组别扩展信息列表</response>
    [HttpGet("/api/cyctf/games/{gameId:int}/division-extensions")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DivisionExtensionResponse[]), StatusCodes.Status200OK)]
    public async Task<IActionResult> GetDivisionExtensionsByGameId(int gameId, CancellationToken token)
    {
        var extensions = await divisionExtensionRepository.GetDivisionExtensionsByGameId(gameId, token);
        return Ok(extensions.Select(DivisionExtensionResponse.FromEntity));
    }
}
