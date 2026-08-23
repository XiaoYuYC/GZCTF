using GZCTF.Models.Data.Cyctf;
using GZCTF.Repositories.Interface;

namespace GZCTF.Repositories;

public class AwardRepository(AppDbContext context, CyctfConfigStore store) :
    RepositoryBase(context), IAwardRepository
{
    private const string RootPrefix = "CYCTF:Award:";
    private static string GamePrefix(int gameId) => $"{RootPrefix}{gameId}:";
    private static string Key(int gameId, int id) => $"{GamePrefix(gameId)}{id}";

    public async Task<List<Award>> GetAwardsByGameId(int gameId, CancellationToken token = default) =>
        (await store.GetByPrefix<Award>(GamePrefix(gameId), token))
        .Select(item => item.Value)
        .Where(item => !item.Deleted)
        .OrderBy(item => item.SortOrder)
        .ThenBy(item => item.Id)
        .ToList();

    public async Task<Award?> GetAwardById(int id, CancellationToken token = default) =>
        (await store.GetByPrefix<Award>(RootPrefix, token))
        .Select(item => item.Value)
        .FirstOrDefault(item => item.Id == id && !item.Deleted);

    public async Task<Award> CreateAward(Award award, CancellationToken token = default)
    {
        award.Id = await store.NextId(RootPrefix, token);
        award.CreateTime = DateTimeOffset.UtcNow;
        award.UpdateTime = award.CreateTime;
        award.Deleted = false;
        await store.Set(Key(award.GameId, award.Id), award, token);
        return award;
    }

    public async Task<Award?> UpdateAward(Award award, CancellationToken token = default)
    {
        var existing = await GetAwardById(award.Id, token);
        if (existing is null)
            return null;

        award.GameId = existing.GameId;
        award.CreateTime = existing.CreateTime;
        award.UpdateTime = DateTimeOffset.UtcNow;
        award.Deleted = false;
        await store.Set(Key(award.GameId, award.Id), award, token);
        return award;
    }

    public async Task<bool> DeleteAward(int id, CancellationToken token = default)
    {
        var award = await GetAwardById(id, token);
        if (award is null)
            return false;

        award.Deleted = true;
        award.UpdateTime = DateTimeOffset.UtcNow;
        await store.Set(Key(award.GameId, award.Id), award, token);
        return true;
    }
}