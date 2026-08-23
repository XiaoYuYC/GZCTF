using GZCTF.Models.Data.Cyctf;
using GZCTF.Repositories.Interface;
using Microsoft.EntityFrameworkCore;

namespace GZCTF.Repositories;

public class DivisionExtensionRepository(AppDbContext context, CyctfConfigStore store) :
    RepositoryBase(context), IDivisionExtensionRepository
{
    private static string Key(int divisionId) => $"CYCTF:DivisionExtension:{divisionId}";

    public async Task<DivisionExtension?> GetDivisionExtensionByDivisionId(int divisionId,
        CancellationToken token = default)
    {
        var extension = await store.Get<DivisionExtension>(Key(divisionId), token);
        if (extension is null || extension.Deleted)
            return null;

        extension.Division = await Context.Divisions.FirstOrDefaultAsync(d => d.Id == divisionId, token) ?? null!;
        return extension.Division is null ? null : extension;
    }

    public async Task<DivisionExtension> CreateOrUpdateDivisionExtension(DivisionExtension extension,
        CancellationToken token = default)
    {
        var existing = await store.Get<DivisionExtension>(Key(extension.DivisionId), token);
        var now = DateTimeOffset.UtcNow;
        extension.CreateTime = existing?.CreateTime ?? now;
        extension.UpdateTime = now;
        extension.Deleted = false;
        await store.Set(Key(extension.DivisionId), extension, token);
        return extension;
    }

    public async Task<bool> DeleteDivisionExtension(int divisionId, CancellationToken token = default)
    {
        var extension = await store.Get<DivisionExtension>(Key(divisionId), token);
        if (extension is null)
            return false;

        extension.Deleted = true;
        extension.UpdateTime = DateTimeOffset.UtcNow;
        await store.Set(Key(divisionId), extension, token);
        return true;
    }

    public async Task<bool> HasDivisionExtension(int divisionId, CancellationToken token = default) =>
        await GetDivisionExtensionByDivisionId(divisionId, token) is not null;

    public async Task<List<DivisionExtension>> GetDivisionExtensionsByGameId(int gameId,
        CancellationToken token = default)
    {
        var divisionIds = await Context.Divisions
            .Where(d => d.GameId == gameId)
            .Select(d => d.Id)
            .ToListAsync(token);
        var result = new List<DivisionExtension>();
        foreach (var divisionId in divisionIds)
        {
            var extension = await GetDivisionExtensionByDivisionId(divisionId, token);
            if (extension is not null)
                result.Add(extension);
        }

        return result;
    }
}