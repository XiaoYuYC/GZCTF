using GZCTF.Models.Data.Cyctf;
using GZCTF.Repositories.Interface;

namespace GZCTF.Repositories;

public class SponsorRepository(AppDbContext context, CyctfConfigStore store) :
    RepositoryBase(context), ISponsorRepository
{
    private const string RootPrefix = "CYCTF:Sponsor:";
    private static string GamePrefix(int gameId) => $"{RootPrefix}{gameId}:";
    private static string Key(int gameId, int id) => $"{GamePrefix(gameId)}{id}";

    public async Task<List<Sponsor>> GetSponsorsByGameId(int gameId, CancellationToken token = default) =>
        (await store.GetByPrefix<Sponsor>(GamePrefix(gameId), token))
        .Select(item => item.Value)
        .Where(item => !item.Deleted)
        .OrderBy(item => item.SortOrder)
        .ThenBy(item => item.Id)
        .ToList();

    public async Task<Sponsor?> GetSponsorById(int id, CancellationToken token = default) =>
        (await store.GetByPrefix<Sponsor>(RootPrefix, token))
        .Select(item => item.Value)
        .FirstOrDefault(item => item.Id == id && !item.Deleted);

    public async Task<Sponsor> CreateSponsor(Sponsor sponsor, CancellationToken token = default)
    {
        sponsor.Id = await store.NextId(RootPrefix, token);
        sponsor.CreateTime = DateTimeOffset.UtcNow;
        sponsor.UpdateTime = sponsor.CreateTime;
        sponsor.Deleted = false;
        await store.Set(Key(sponsor.GameId, sponsor.Id), sponsor, token);
        return sponsor;
    }

    public async Task<Sponsor?> UpdateSponsor(Sponsor sponsor, CancellationToken token = default)
    {
        var existing = await GetSponsorById(sponsor.Id, token);
        if (existing is null)
            return null;

        sponsor.GameId = existing.GameId;
        sponsor.CreateTime = existing.CreateTime;
        sponsor.UpdateTime = DateTimeOffset.UtcNow;
        sponsor.Deleted = false;
        await store.Set(Key(sponsor.GameId, sponsor.Id), sponsor, token);
        return sponsor;
    }

    public async Task<bool> DeleteSponsor(int id, CancellationToken token = default)
    {
        var sponsor = await GetSponsorById(id, token);
        if (sponsor is null)
            return false;

        sponsor.Deleted = true;
        sponsor.UpdateTime = DateTimeOffset.UtcNow;
        await store.Set(Key(sponsor.GameId, sponsor.Id), sponsor, token);
        return true;
    }
}