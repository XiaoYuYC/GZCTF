using GZCTF.Models.Data.Cyctf;
using GZCTF.Repositories.Interface;

namespace GZCTF.Repositories;

public class GameExtensionRepository(AppDbContext context, CyctfConfigStore store) :
    RepositoryBase(context), IGameExtensionRepository
{
    private static string Key(int gameId) => $"CYCTF:GameExtension:{gameId}";

    public async Task<GameExtension?> GetGameExtensionByGameId(int gameId, CancellationToken token = default)
    {
        var extension = await store.Get<GameExtension>(Key(gameId), token);
        return extension is null || extension.Deleted ? null : extension;
    }

    public async Task<GameExtension> CreateOrUpdateGameExtension(GameExtension extension,
        CancellationToken token = default)
    {
        var existing = await store.Get<GameExtension>(Key(extension.GameId), token);
        var now = DateTimeOffset.UtcNow;
        if (existing is null)
        {
            extension.CreateTime = now;
            extension.CurrentTeams = 0;
        }
        else
        {
            extension.CreateTime = existing.CreateTime;
            extension.CurrentTeams = existing.CurrentTeams;
        }

        extension.Deleted = false;
        extension.UpdateTime = now;
        await store.Set(Key(extension.GameId), extension, token);
        return extension;
    }

    public async Task<bool> DeleteGameExtension(int gameId, CancellationToken token = default)
    {
        var extension = await store.Get<GameExtension>(Key(gameId), token);
        if (extension is null)
            return false;

        extension.Deleted = true;
        extension.UpdateTime = DateTimeOffset.UtcNow;
        await store.Set(Key(gameId), extension, token);
        return true;
    }

    public async Task<bool> HasGameExtension(int gameId, CancellationToken token = default) =>
        await GetGameExtensionByGameId(gameId, token) is not null;

    public async Task UpdateCurrentTeams(int gameId, int count, CancellationToken token = default)
    {
        var extension = await store.Get<GameExtension>(Key(gameId), token);
        if (extension is null)
            return;

        extension.CurrentTeams = Math.Max(0, count);
        extension.UpdateTime = DateTimeOffset.UtcNow;
        await store.Set(Key(gameId), extension, token);
    }
}