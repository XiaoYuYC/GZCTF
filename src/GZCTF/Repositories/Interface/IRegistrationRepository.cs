using GZCTF.Models.Data.Cyctf;
using GZCTF.Utils;

namespace GZCTF.Repositories.Interface;

public interface IRegistrationRepository : IRepository
{
    Task<List<Registration>> GetRegistrationsByGameId(int gameId, string? status = null,
        CancellationToken token = default);

    /// <summary>
    /// 获取指定比赛的全部报名记录，包括软删除记录，用于清理历史参赛关系。
    /// </summary>
    Task<List<Registration>> GetRegistrationsByGameIdIncludingDeleted(int gameId,
        CancellationToken token = default);

    Task<Registration?> GetRegistrationByTeamAndGame(int teamId, int gameId,

        CancellationToken token = default);

    Task<Registration?> GetActiveRegistrationByCaptainAndGame(Guid captainId, int gameId,
        CancellationToken token = default);

    Task<Registration?> GetRegistrationByEmailAndGame(string email, int gameId,
        CancellationToken token = default);

    Task<Registration?> GetApprovedRegistrationByEmailAndGame(string email, int gameId,
        CancellationToken token = default);

    Task<Registration?> GetRegistrationById(int id, CancellationToken token = default);

    Task<Registration> CreateRegistration(Registration registration, CancellationToken token = default);

    Task<Registration?> UpdateRegistrationStatus(int id, string status, string? reviewNote, Guid? reviewedBy,
        CancellationToken token = default);

    Task<Registration?> UpdateRegistrationStatus(Registration registration, string status, string? reviewNote,
        Guid? reviewedBy, CancellationToken token = default);

    Task<bool> HasRegistration(int teamId, int gameId, CancellationToken token = default);

    Task<Dictionary<string, int>> GetRegistrationStats(int gameId, CancellationToken token = default);

    Task<byte[]> ExportCsv(int? gameId, string? status, CancellationToken token = default);

    /// <summary>
    /// 按组别分别导出报名信息，每个组别生成一个 Excel 工作簿并打包为 ZIP。
    /// </summary>
    Task<byte[]> ExportExcelZip(int? gameId, string? status, CancellationToken token = default);

    Task<bool> DeleteRegistration(int id, CancellationToken token = default);

    /// <summary>
    /// 检查队伍名在指定比赛中是否已存在（包括已有队伍和未审核报名中的队伍名）
    /// </summary>
    Task<bool> IsTeamNameExistsInGame(string teamName, int gameId, CancellationToken token = default);

    /// <summary>
    /// 检查邮箱是否在指定比赛的已通过报名中存在（作为队长或队员）
    /// </summary>
    Task<bool> IsEmailInApprovedRegistration(string email, int gameId, CancellationToken token = default);

    /// <summary>
    /// 根据邀请令牌查找报名记录
    /// </summary>
    Task<Registration?> GetRegistrationByInvitationToken(string token, CancellationToken cancellationToken = default);

    /// <summary>
    /// 更新报名记录
    /// </summary>
    Task UpdateRegistration(Registration registration, CancellationToken token = default);
}
