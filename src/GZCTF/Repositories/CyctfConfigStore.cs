using System.Text.Json;
using GZCTF.Models.Data;
using Microsoft.EntityFrameworkCore;

namespace GZCTF.Repositories;

/// <summary>
/// Stores CYCTF records in GZCTF's existing Configs table.
/// This deliberately adds no EF entity or schema object.
/// </summary>
public sealed class CyctfConfigStore(AppDbContext context)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    public Task<Config?> GetConfig(string key, CancellationToken token = default) =>
        context.Configs.FirstOrDefaultAsync(item => item.ConfigKey == key, token);

    public async Task<T?> Get<T>(string key, CancellationToken token = default)
    {
        var config = await GetConfig(key, token);
        return config?.Value is null ? default : JsonSerializer.Deserialize<T>(config.Value, JsonOptions);
    }

    public async Task<List<(string Key, T Value)>> GetByPrefix<T>(string prefix, CancellationToken token = default)
    {
        var configs = await context.Configs
            .Where(item => item.ConfigKey.StartsWith(prefix))
            .ToListAsync(token);
        var values = new List<(string Key, T Value)>(configs.Count);

        foreach (var config in configs)
        {
            if (config.Value is null)
                continue;

            var value = JsonSerializer.Deserialize<T>(config.Value, JsonOptions);
            if (value is not null)
                values.Add((config.ConfigKey, value));
        }

        return values;
    }

    public async Task Set<T>(string key, T value, CancellationToken token = default)
    {
        var config = await GetConfig(key, token);
        var serialized = JsonSerializer.Serialize(value, JsonOptions);
        if (config is null)
            await context.Configs.AddAsync(new Config(key, serialized), token);
        else
            config.Value = serialized;

        await context.SaveChangesAsync(token);
    }

    public async Task<bool> Delete(string key, CancellationToken token = default)
    {
        var config = await GetConfig(key, token);
        if (config is null)
            return false;

        context.Configs.Remove(config);
        await context.SaveChangesAsync(token);
        return true;
    }
    public async Task<int> ReplaceByPrefixAndValue<T>(string prefix, Func<T, bool> predicate,
        string key, T value, CancellationToken token = default)
    {
        var configs = await context.Configs
            .Where(item => item.ConfigKey.StartsWith(prefix))
            .ToListAsync(token);
        var matched = new List<Config>();
        Config? destination = null;
        foreach (var config in configs)
        {
            if (config.ConfigKey == key)
                destination = config;
            if (config.Value is null)
                continue;

            try
            {
                var current = JsonSerializer.Deserialize<T>(config.Value, JsonOptions);
                if (current is not null && predicate(current))
                    matched.Add(config);
            }
            catch (JsonException)
            {
                // Ignore unrelated or malformed values in the shared keyspace.
            }
        }

        var serialized = JsonSerializer.Serialize(value, JsonOptions);
        if (destination is null)
        {
            destination = new Config(key, serialized);
            await context.Configs.AddAsync(destination, token);
        }
        else
        {
            destination.Value = serialized;
        }

        context.Configs.RemoveRange(matched.Where(item => item.ConfigKey != key));
        await context.SaveChangesAsync(token);
        return matched.Count;
    }


    public async Task<int> NextId(string prefix, CancellationToken token = default)
    {
        var configs = await context.Configs
            .Where(item => item.ConfigKey.StartsWith(prefix))
            .Select(item => item.Value)
            .ToListAsync(token);
        var max = 0;

        foreach (var value in configs)
        {
            if (string.IsNullOrWhiteSpace(value))
                continue;

            try
            {
                using var document = JsonDocument.Parse(value);
                if (document.RootElement.TryGetProperty("id", out var idProperty) &&
                    idProperty.TryGetInt32(out var id) && id > max)
                    max = id;
            }
            catch (JsonException)
            {
                // Ignore non-JSON Config values in the shared keyspace.
            }
        }

        return max == int.MaxValue ? 1 : max + 1;
    }
}