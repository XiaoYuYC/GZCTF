using System.Globalization;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using GZCTF.Models.Data;
using GZCTF.Models.Data.Cyctf;
using GZCTF.Repositories.Interface;
using Microsoft.EntityFrameworkCore;
using NPOI.SS.UserModel;
using NPOI.XSSF.UserModel;

namespace GZCTF.Repositories;

public class RegistrationRepository(AppDbContext context, CyctfConfigStore store) :
    RepositoryBase(context), IRegistrationRepository
{
    private const string RootPrefix = "CYCTF:Registration:";
    private static string Key(int gameId, int teamId) => $"{RootPrefix}{gameId}:{teamId}";
    private static string EmailKey(int gameId, string? email) =>
        $"{RootPrefix}{gameId}:email:{email?.Trim().ToLowerInvariant()}";
    private static string ArchiveKey(int gameId, int id) => $"{RootPrefix}{gameId}:history:{id}";

    private async Task<string> ResolveWriteKey(Registration registration, CancellationToken token)
    {
        if (registration.TeamId.HasValue)
            return Key(registration.GameId, registration.TeamId.Value);

        var existingKey = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Where(item => item.Value.Id == registration.Id && item.Value.GameId == registration.GameId)
            .OrderByDescending(item => item.Value.UpdateTime)
            .ThenByDescending(item => item.Value.Deleted)
            .Select(item => item.Key)
            .FirstOrDefault();
        if (string.IsNullOrWhiteSpace(registration.CaptainEmail))
            return existingKey ?? EmailKey(registration.GameId, null);

        var archivePrefix = $"{RootPrefix}{registration.GameId}:history:";
        if (existingKey?.StartsWith(archivePrefix, StringComparison.Ordinal) == true)
            return existingKey;

        var emailKey = EmailKey(registration.GameId, registration.CaptainEmail);
        var currentEmailRegistration = await store.Get<Registration>(emailKey, token);
        return currentEmailRegistration is null || currentEmailRegistration.Id == registration.Id
            ? emailKey
            : ArchiveKey(registration.GameId, registration.Id);
    }

    public async Task<List<Registration>> GetRegistrationsByGameId(int gameId, string? status = null,
        CancellationToken token = default)
    {
        // 支持多状态筛选，逗号分隔
        var statusList = string.IsNullOrWhiteSpace(status)
            ? null
            : status.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(s => s.ToUpperInvariant())
                    .ToHashSet();

        var registrations = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId)
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted).First())
            .Where(item => !item.Deleted)
            .Where(item => statusList == null || statusList.Contains(item.Status))
            .OrderByDescending(item => item.CreateTime)
            .ToList();

        await Hydrate(registrations, token);
        return registrations;
    }

    public async Task<List<Registration>> GetRegistrationsByGameIdIncludingDeleted(int gameId,
        CancellationToken token = default)
    {
        var registrations = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId)
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted).First())
            .OrderByDescending(item => item.CreateTime)
            .ToList();

        await Hydrate(registrations, token);
        return registrations;
    }

    public async Task<Registration?> GetRegistrationByTeamAndGame(int teamId, int gameId,
        CancellationToken token = default)
    {
        var registration = await store.Get<Registration>(Key(gameId, teamId), token);
        if (registration is null || registration.Deleted)
            return null;

        await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> GetActiveRegistrationByCaptainAndGame(Guid captainId, int gameId,
        CancellationToken token = default)
    {
        var captainTeamIds = await Context.Teams
            .Where(team => team.CaptainId == captainId)
            .Select(team => team.Id)
            .ToHashSetAsync(token);
        if (captainTeamIds.Count == 0)
            return null;

        var registration = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId &&
                           item.TeamId.HasValue && captainTeamIds.Contains(item.TeamId.Value))
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted)
                .First())
            .Where(item => !item.Deleted && item.Status is not ("CANCELLED" or "REJECTED"))
            .OrderByDescending(item => item.UpdateTime)
            .FirstOrDefault();

        if (registration is not null)
            await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> GetRegistrationByEmailAndGame(string email, int gameId,
        CancellationToken token = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var registration = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId &&
                           item.CaptainEmail != null &&
                           item.CaptainEmail.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase))
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted).First())
            .Where(item => !item.Deleted)
            .OrderByDescending(item => item.UpdateTime)
            .FirstOrDefault();

        if (registration is not null)
            await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> GetApprovedRegistrationByEmailAndGame(string email, int gameId,
        CancellationToken token = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();
        var registration = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId &&
                           item.CaptainEmail != null &&
                           item.CaptainEmail.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase))
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted).First())
            .Where(item => !item.Deleted && item.Status == "APPROVED")
            .OrderByDescending(item => item.UpdateTime)
            .FirstOrDefault();

        if (registration is not null)
            await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> GetRegistrationById(int id, CancellationToken token = default)
    {
        var registrations = await store.GetByPrefix<Registration>(RootPrefix, token);
        var registration = registrations.Select(item => item.Value)
            .Where(item => item.Id == id)
            .OrderByDescending(item => item.UpdateTime)
            .ThenByDescending(item => item.Deleted)
            .FirstOrDefault();
        if (registration is not null && !registration.Deleted)
            await Hydrate(registration, token);
        return registration is { Deleted: false } ? registration : null;
    }

    public async Task<Registration> CreateRegistration(Registration registration,
        CancellationToken token = default)
    {
        // 无需登录报名使用 Email + GameId 作为当前记录键；同邮箱历史记录改为归档键保留。
        var key = registration.TeamId.HasValue
            ? Key(registration.GameId, registration.TeamId.Value)
            : EmailKey(registration.GameId, registration.CaptainEmail);

        var existing = await store.Get<Registration>(key, token);
        if (existing is not null &&
            (existing.Deleted || !string.Equals(existing.Status, "APPROVED", StringComparison.OrdinalIgnoreCase)))
        {
            await store.Set(ArchiveKey(existing.GameId, existing.Id), existing, token);
            await store.Delete(key, token);
            existing = null;
        }

        registration.Id = existing?.Id ?? await store.NextId(RootPrefix, token);
        registration.CreateTime = existing?.CreateTime ?? DateTimeOffset.UtcNow;
        registration.UpdateTime = DateTimeOffset.UtcNow;
        registration.Deleted = false;
        await store.Set(key, registration, token);
        await Hydrate(registration, token);
        return registration;
    }

    public async Task<Registration?> UpdateRegistrationStatus(int id, string status, string? reviewNote,
        Guid? reviewedBy, CancellationToken token = default)
    {
        var registration = await GetRegistrationById(id, token);
        return registration is null
            ? null
            : await UpdateRegistrationStatus(registration, status, reviewNote, reviewedBy, token);
    }

    public async Task<Registration?> UpdateRegistrationStatus(Registration registration, string status,
        string? reviewNote, Guid? reviewedBy, CancellationToken token = default)
    {
        registration.Status = status.ToUpperInvariant();
        registration.ReviewNote = reviewNote;
        registration.ReviewedBy = reviewedBy;
        registration.ReviewedAt = DateTimeOffset.UtcNow;
        registration.UpdateTime = registration.ReviewedAt.Value;

        var key = await ResolveWriteKey(registration, token);

        await store.ReplaceByPrefixAndValue(RootPrefix,
            item => item.Id == registration.Id && item.GameId == registration.GameId,
            key, registration, token);
        return registration;
    }

    public async Task<bool> HasRegistration(int teamId, int gameId, CancellationToken token = default) =>
        await GetRegistrationByTeamAndGame(teamId, gameId, token) is
        { Status: not ("CANCELLED" or "REJECTED") };

    public async Task<Dictionary<string, int>> GetRegistrationStats(int gameId,
        CancellationToken token = default)
    {
        var registrations = await GetRegistrationsByGameId(gameId, token: token);
        return registrations.GroupBy(item => item.Status)
            .ToDictionary(group => group.Key, group => group.Count());
    }

    public async Task<byte[]> ExportCsv(int? gameId, string? status, CancellationToken token = default)
    {
        var (registrations, fieldSchemas) = await LoadExportData(gameId, status, token);
        var rows = new List<ExportRow>(registrations.Count);
        var columns = new List<ExportColumn>();
        var columnKeys = new HashSet<string>(StringComparer.Ordinal);
        foreach (var registration in registrations)
        {
            var row = BuildExportRow(registration, fieldSchemas[registration.DivisionId], columns, columnKeys);
            rows.Add(row);
        }

        var csv = new StringBuilder("\uFEFF");
        var headers = ExportLeadingHeaders.Concat(columns).Concat(ExportTrailingHeaders).ToArray();
        csv.AppendLine(string.Join(',', headers.Select(column => Escape(column.Header))));

        foreach (var row in rows)
        {
            csv.AppendLine(string.Join(',', headers.Select(column =>
                    GetExportValue(row, column))
                .Select(Escape)));
        }

        return Encoding.UTF8.GetBytes(csv.ToString());
    }

    public async Task<byte[]> ExportExcelZip(int? gameId, string? status, CancellationToken token = default)
    {
        var (registrations, fieldSchemas) = await LoadExportData(gameId, status, token);
        var divisionGroups = registrations
            .GroupBy(item => item.DivisionId)
            .ToDictionary(
                group => group.Key,
                group => (Name: group.First().Division?.Name ?? $"组别-{group.Key}", Registrations: group.ToList()));

        // 指定赛事时，即使某个分组暂时没有报名记录，也生成对应的空工作簿和分组表头。
        if (gameId is { } selectedGameId)
        {
            var divisions = await Context.Divisions
                .AsNoTracking()
                .Where(division => division.GameId == selectedGameId)
                .Select(division => new { division.Id, division.Name })
                .ToListAsync(token);
            foreach (var division in divisions)
            {
                if (!fieldSchemas.ContainsKey(division.Id))
                {
                    var extension = await store.Get<DivisionExtension>($"CYCTF:DivisionExtension:{division.Id}", token);
                    fieldSchemas[division.Id] = ParseExportFields(extension?.RegistrationFields);
                }

                if (!divisionGroups.ContainsKey(division.Id))
                    divisionGroups[division.Id] = (division.Name, []);
            }
        }

        using var zipStream = new MemoryStream();
        using (var archive = new ZipArchive(zipStream, ZipArchiveMode.Create, true))
        {
            foreach (var divisionGroup in divisionGroups.OrderBy(item => item.Key))
            {
                var rows = new List<ExportRow>(divisionGroup.Value.Registrations.Count);
                var columns = new List<ExportColumn>();
                var columnKeys = new HashSet<string>(StringComparer.Ordinal);
                foreach (var registration in divisionGroup.Value.Registrations)
                    rows.Add(BuildExportRow(registration, fieldSchemas[registration.DivisionId], columns, columnKeys));

                // 空分组没有报名行，但仍按该分组的字段配置生成动态表头。
                if (divisionGroup.Value.Registrations.Count == 0)
                    AddSchemaColumns(fieldSchemas[divisionGroup.Key], columns, columnKeys);

                var workbook = BuildRegistrationWorkbook(divisionGroup.Value.Name, rows, columns);
                var entryName = $"组别{divisionGroup.Key}-{SanitizeFileName(divisionGroup.Value.Name)}.xlsx";
                var entry = archive.CreateEntry(entryName, CompressionLevel.Fastest);
                using var entryStream = entry.Open();
                workbook.Write(entryStream, true);
                workbook.Close();
            }
        }

        return zipStream.ToArray();
    }

    private async Task<(List<Registration> Registrations, Dictionary<int, List<ExportField>> FieldSchemas)> LoadExportData(
        int? gameId, string? status, CancellationToken token)
    {
        var registrations = (await store.GetByPrefix<Registration>(RootPrefix, token))
            .Select(item => item.Value)
            .Where(item => gameId is null || item.GameId == gameId)
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted).First())
            .Where(item => !item.Deleted)
            .Where(item => string.IsNullOrWhiteSpace(status) ||
                           item.Status == status!.Trim().ToUpperInvariant())
            .OrderByDescending(item => item.CreateTime)
            .ToList();
        await Hydrate(registrations, token);

        var fieldSchemas = new Dictionary<int, List<ExportField>>();
        foreach (var divisionId in registrations.Select(item => item.DivisionId).Distinct())
        {
            var extension = await store.Get<DivisionExtension>($"CYCTF:DivisionExtension:{divisionId}", token);
            fieldSchemas[divisionId] = ParseExportFields(extension?.RegistrationFields);
        }

        return (registrations, fieldSchemas);
    }

    private static void AddSchemaColumns(IReadOnlyCollection<ExportField> fields,
        ICollection<ExportColumn> columns, ISet<string> columnKeys)
    {
        foreach (var field in fields)
        {
            if (string.Equals(field.Scope, "team", StringComparison.Ordinal))
                AddColumn(columns, columnKeys, $"teamField:{field.Name}", field.Label);
            else
                AddColumn(columns, columnKeys, $"captainField:{field.Name}", $"队长{field.Label}");
        }
    }

    private static XSSFWorkbook BuildRegistrationWorkbook(string divisionName, IReadOnlyCollection<ExportRow> rows,
        IReadOnlyCollection<ExportColumn> columns)
    {
        var workbook = new XSSFWorkbook();
        var sheet = workbook.CreateSheet(SanitizeSheetName(divisionName));
        var headerStyle = workbook.CreateCellStyle();
        var font = workbook.CreateFont();
        font.IsBold = true;
        headerStyle.SetFont(font);
        headerStyle.BorderBottom = BorderStyle.Medium;
        headerStyle.Alignment = HorizontalAlignment.Center;
        headerStyle.VerticalAlignment = VerticalAlignment.Center;

        var headers = ExportLeadingHeaders.Concat(columns).Concat(ExportTrailingHeaders).ToArray();
        var headerRow = sheet.CreateRow(0);
        for (var index = 0; index < headers.Length; index++)
        {
            var cell = headerRow.CreateCell(index);
            cell.SetCellValue(headers[index].Header);
            cell.CellStyle = headerStyle;
        }

        var rowIndex = 1;
        foreach (var row in rows)
        {
            var output = sheet.CreateRow(rowIndex++);
            for (var index = 0; index < headers.Length; index++)
            {
                var value = GetExportValue(row, headers[index]);
                output.CreateCell(index).SetCellValue(value);
            }
        }

        for (var index = 0; index < headers.Length; index++)
        {
            var maxLength = headers[index].Header.Length;
            foreach (var row in rows)
            {
                var value = GetExportValue(row, headers[index]);
                if (!string.IsNullOrEmpty(value))
                    maxLength = Math.Max(maxLength, value.Length);
            }

            // Avoid NPOI AutoSizeColumn: it loads SkiaSharp native libraries that are not
            // available in the lightweight deployment image.
            var width = Math.Clamp(maxLength + 2, 10, 50);
            sheet.SetColumnWidth(index, width * 256);
        }

        return workbook;
    }

    private static readonly ExportFixedColumn[] ExportLeadingHeaders =
    [new("teamName", "队伍名")];

    private static readonly ExportFixedColumn[] ExportTrailingHeaders =
    [
        new("status", "报名状态"), new("reviewNote", "审核备注"), new("reviewer", "审核人"),
        new("createTime", "报名时间"), new("reviewedAt", "审核时间"), new("updateTime", "更新时间")
    ];

    private static string GetExportValue(ExportRow row, ExportColumn column) =>
        row.Values.GetValueOrDefault(column.Key) ?? row.DynamicValues.GetValueOrDefault(column.Key) ?? string.Empty;

    private sealed record ExportFixedColumn(string Key, string Header) : ExportColumn(Key, Header);

    private static string SanitizeFileName(string name)
    {
        var invalid = Path.GetInvalidFileNameChars().Concat(['<', '>', ':', '"', '/', '\\', '|', '?', '*']).ToHashSet();
        var sanitized = new string(name.Select(character => invalid.Contains(character) ? '_' : character).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "未命名组别" : sanitized;
    }

    private static string SanitizeSheetName(string name)
    {
        var sanitized = new string(name.Select(character => character is '[' or ']' or ':' or '*' or '?' or '/' or '\\'
            ? '_'
            : character).ToArray()).Trim();
        if (string.IsNullOrWhiteSpace(sanitized))
            sanitized = "报名信息";
        return sanitized[..Math.Min(sanitized.Length, 31)];
    }

    private sealed record ExportField(string Name, string Label, string Scope);

    private record ExportColumn(string Key, string Header);

    private sealed class ExportRow
    {
        public Dictionary<string, string> Values { get; } = new(StringComparer.Ordinal);
        public Dictionary<string, string> DynamicValues { get; } = new(StringComparer.Ordinal);
    }

    private static readonly JsonSerializerOptions ExportJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static List<ExportField> ParseExportFields(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];

        try
        {
            using var document = JsonDocument.Parse(raw);
            var fields = new List<ExportField>();
            foreach (var item in EnumerateExportFieldObjects(document.RootElement))
            {
                var name = GetJsonString(item, "fieldName") ?? GetJsonString(item, "name") ?? GetJsonString(item, "key");
                if (string.IsNullOrWhiteSpace(name))
                    continue;
                var label = GetJsonString(item, "label");
                var scope = string.Equals(GetJsonString(item, "scope"), "member", StringComparison.OrdinalIgnoreCase) ||
                            string.Equals(GetJsonString(item, "scope"), "player", StringComparison.OrdinalIgnoreCase)
                    ? "member"
                    : "team";
                fields.Add(new ExportField(name.Trim(), string.IsNullOrWhiteSpace(label) ? name.Trim() : label.Trim(), scope));
            }

            return fields
                .GroupBy(field => $"{field.Scope}:{field.Name}", StringComparer.Ordinal)
                .Select(group => group.First())
                .ToList();
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static IEnumerable<JsonElement> EnumerateExportFieldObjects(JsonElement schema)
    {
        if (schema.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in schema.EnumerateArray())
                if (item.ValueKind == JsonValueKind.Object)
                    yield return item;
            yield break;
        }

        if (schema.ValueKind != JsonValueKind.Object)
            yield break;

        if (TryGetJsonProperty(schema, "fields", out var fields) && fields.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in EnumerateExportFieldObjects(fields))
                yield return item;
            yield break;
        }

        foreach (var property in schema.EnumerateObject())
        {
            if (property.Value.ValueKind != JsonValueKind.Object)
                continue;
            var copy = new Dictionary<string, object?> { ["name"] = property.Name };
            foreach (var item in property.Value.EnumerateObject())
                copy[item.Name] = item.Value.Clone();
            yield return JsonSerializer.SerializeToElement(copy);
        }
    }

    private static ExportRow BuildExportRow(Registration registration, IReadOnlyCollection<ExportField> fields,
        ICollection<ExportColumn> columns, ISet<string> columnKeys)
    {
        var row = new ExportRow();
        var formValues = ParseJsonObject(registration.FormData);
        var teamFields = fields.Where(field => field.Scope == "team").ToArray();
        var memberFields = fields.Where(field => field.Scope == "member").ToArray();

        Set(row.Values, "teamName", registration.TeamName ?? registration.Team?.Name);
        Set(row.Values, "status", TranslateRegistrationStatus(registration.Status));
        Set(row.Values, "reviewNote", registration.ReviewNote);
        Set(row.Values, "reviewer", registration.Reviewer?.UserName);
        Set(row.Values, "createTime", registration.CreateTime);
        Set(row.Values, "reviewedAt", registration.ReviewedAt);
        Set(row.Values, "updateTime", registration.UpdateTime);

        foreach (var field in teamFields)
        {
            var key = $"teamField:{field.Name}";
            AddColumn(columns, columnKeys, key, field.Label);
            row.DynamicValues[key] = FormatExportValue(formValues?.GetValueOrDefault(field.Name));
        }

        foreach (var field in memberFields)
        {
            var key = $"captainField:{field.Name}";
            AddColumn(columns, columnKeys, key, $"队长{field.Label}");
            row.DynamicValues[key] = FormatExportValue(formValues?.GetValueOrDefault(field.Name));
        }

        var invitations = ParseInvitations(registration.MemberInvitations);
        for (var index = 0; index < invitations.Count; index++)
        {
            var memberValues = ParseJsonObject(invitations[index].MemberFields);
            var prefix = $"member{index + 1}";
            foreach (var field in memberFields)
            {
                var key = $"{prefix}.field:{field.Name}";
                AddColumn(columns, columnKeys, key, $"队员{index + 1}{field.Label}");
                row.DynamicValues[key] = FormatExportValue(memberValues?.GetValueOrDefault(field.Name));
            }
        }

        return row;
    }

    private static List<MemberInvitation> ParseInvitations(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return [];
        try
        {
            return JsonSerializer.Deserialize<List<MemberInvitation>>(raw, ExportJsonOptions) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    private static Dictionary<string, JsonElement>? ParseJsonObject(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;
        try
        {
            using var document = JsonDocument.Parse(raw);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
                return null;
            return document.RootElement.EnumerateObject()
                .ToDictionary(property => property.Name, property => property.Value.Clone(), StringComparer.Ordinal);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private static bool TryGetJsonProperty(JsonElement element, string name, out JsonElement value)
    {
        foreach (var property in element.EnumerateObject())
        {
            if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                value = property.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    private static string? GetJsonString(JsonElement element, string name) =>
        TryGetJsonProperty(element, name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static void AddColumn(ICollection<ExportColumn> columns, ISet<string> keys, string key, string header)
    {
        if (keys.Add(key))
            columns.Add(new ExportColumn(key, header));
    }

    private static void Set(Dictionary<string, string> values, string key, object? value, bool boolean = false) =>
        values[key] = value is null ? string.Empty : boolean && value is bool flag ? (flag ? "是" : "否") : FormatExportValue(value);

    private static string FormatExportValue(object? value)
    {
        if (value is null)
            return string.Empty;
        if (value is JsonElement element)
            return FormatJsonExportValue(element);
        if (value is DateTimeOffset dateTime)
            return dateTime.ToString("yyyy-MM-dd HH:mm:ss", CultureInfo.InvariantCulture);
        if (value is bool flag)
            return flag ? "是" : "否";
        return Convert.ToString(value, CultureInfo.InvariantCulture) ?? string.Empty;
    }

    private static string FormatJsonExportValue(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Null or JsonValueKind.Undefined => string.Empty,
        JsonValueKind.String => value.GetString() ?? string.Empty,
        JsonValueKind.True => "是",
        JsonValueKind.False => "否",
        JsonValueKind.Number => value.ToString(),
        JsonValueKind.Array => string.Join("、", value.EnumerateArray().Select(FormatJsonExportValue)
            .Where(item => !string.IsNullOrWhiteSpace(item))),
        JsonValueKind.Object => string.Join("；", value.EnumerateObject()
            .Select(item => $"{item.Name}: {FormatJsonExportValue(item.Value)}")),
        _ => value.ToString()
    };

    private static string TranslateRegistrationStatus(string? status) => status?.ToUpperInvariant() switch
    {
        "PENDING" => "待审核",
        "APPROVED" => "已通过",
        "REJECTED" => "已拒绝",
        "CANCELLED" => "已取消",
        _ => status ?? string.Empty
    };

    private static string TranslateInvitationStatus(string? status) => status?.ToUpperInvariant() switch
    {
        "PENDING" => "待接受",
        "ACCEPTED" => "已接受",
        "REJECTED" => "已拒绝",
        _ => status ?? string.Empty
    };

    private static string Escape(object? value)
    {
        var text = value?.ToString() ?? string.Empty;
        return text.Contains(',') || text.Contains('"') || text.Contains('\r') || text.Contains('\n')
            ? $"\"{text.Replace("\"", "\"\"")}\""
            : text;
    }

    public async Task<bool> DeleteRegistration(int id, CancellationToken token = default)
    {
        var registration = await GetRegistrationById(id, token);
        if (registration is null)
            return false;

        registration.Deleted = true;
        registration.UpdateTime = DateTimeOffset.UtcNow;
        var key = await ResolveWriteKey(registration, token);

        await store.ReplaceByPrefixAndValue(RootPrefix,
            item => item.Id == registration.Id && item.GameId == registration.GameId,
            key, registration, token);
        return true;
    }

    public async Task<bool> IsTeamNameExistsInGame(string teamName, int gameId, CancellationToken token = default)
    {
        var normalizedName = teamName.Trim();

        // 1. 检查已创建的队伍（队伍名全局唯一）
        var teamExists = await Context.Teams
            .AnyAsync(t => t.Name == normalizedName, token);

        if (teamExists)
            return true;

        // 2. 检查同一比赛中待审核报名的队伍名
        var registrations = await store.GetByPrefix<Registration>(RootPrefix, token);
        var pendingWithSameName = registrations
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId)
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted).First())
            .Any(r => !r.Deleted &&
                      r.Status == "PENDING" &&
                      !string.IsNullOrWhiteSpace(r.TeamName) &&
                      r.TeamName.Equals(normalizedName, StringComparison.OrdinalIgnoreCase));

        return pendingWithSameName;
    }

    public async Task<bool> IsEmailInApprovedRegistration(string email, int gameId, CancellationToken token = default)
    {
        var normalizedEmail = email.Trim().ToLowerInvariant();

        var registrations = await store.GetByPrefix<Registration>(RootPrefix, token);
        var approvedRegistrations = registrations
            .Select(item => item.Value)
            .Where(item => item.GameId == gameId)
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted).First())
            .Where(item => !item.Deleted && item.Status == "APPROVED")
            .ToList();

        foreach (var reg in approvedRegistrations)
        {
            // 检查队长邮箱
            if (reg.CaptainEmail?.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase) == true)
                return true;

            // 检查队员邀请中的邮箱
            if (!string.IsNullOrWhiteSpace(reg.MemberInvitations))
            {
                try
                {
                    var invitations = System.Text.Json.JsonSerializer.Deserialize<List<MemberInvitation>>(reg.MemberInvitations);
                    if (invitations?.Any(inv => inv.Email.Equals(normalizedEmail, StringComparison.OrdinalIgnoreCase)) == true)
                        return true;
                }
                catch
                {
                    // JSON 解析失败，跳过
                }
            }
        }

        return false;
    }

    private async Task Hydrate(IEnumerable<Registration> registrations, CancellationToken token)
    {
        foreach (var registration in registrations)
            await Hydrate(registration, token);
    }

    private async Task Hydrate(Registration registration, CancellationToken token)
    {
        registration.Game = await Context.Games.FirstOrDefaultAsync(item => item.Id == registration.GameId, token) ?? null!;
        if (registration.TeamId.HasValue)
        {
            registration.Team = await Context.Teams
                .Include(item => item.Members)
                .Include(item => item.Captain)
                .FirstOrDefaultAsync(item => item.Id == registration.TeamId.Value, token) ?? null!;
        }
        registration.Division = await Context.Divisions
            .FirstOrDefaultAsync(item => item.Id == registration.DivisionId, token) ?? null!;
        if (registration.ReviewedBy is { } reviewerId)
            registration.Reviewer = await Context.Users.FirstOrDefaultAsync(item => item.Id == reviewerId, token);
    }

    // IDs are allocated from the existing Config keyspace.


    public async Task<Registration?> GetRegistrationByInvitationToken(string token, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(token))
            return null;

        // 遍历所有报名记录，查找包含该 token 的 MemberInvitations
        var allRegistrations = (await store.GetByPrefix<Registration>(RootPrefix, cancellationToken))
            .Select(item => item.Value)
            .GroupBy(item => item.Id)
            .Select(group => group.OrderByDescending(item => item.UpdateTime)
                .ThenByDescending(item => item.Deleted).First())
            .Where(item => !item.Deleted && !string.IsNullOrEmpty(item.MemberInvitations));

        foreach (var registration in allRegistrations)
        {
            try
            {
                var invitations = System.Text.Json.JsonSerializer.Deserialize<List<MemberInvitation>>(registration.MemberInvitations!);
                if (invitations != null && invitations.Any(inv => inv.Token == token))
                {
                    await Hydrate(registration, cancellationToken);
                    return registration;
                }
            }
            catch
            {
                // 解析失败，跳过该记录
            }
        }

        return null;
    }

    public async Task UpdateRegistration(Registration registration, CancellationToken token = default)
    {
        var key = await ResolveWriteKey(registration, token);
        await store.ReplaceByPrefixAndValue(RootPrefix,
            item => item.Id == registration.Id && item.GameId == registration.GameId,
            key, registration, token);
    }

}