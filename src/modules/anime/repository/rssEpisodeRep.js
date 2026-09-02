import { EPISODE_FAILED_REASON, EPISODE_STATUS } from "../constants/rssTaskStatusConst.js";

const dbName = 'anime';

/**
 * 番剧 RSS 剧集与异常集数仓储服务
 */
export default {
    /* ================= 正常剧集 ================= */

    /**
     * 根据主键 ID 查询剧集存储链接与状态
     * @param {number} id - 主键 ID
     * @returns {Promise<{ link: string, status: string }|null>}
     */
    selectOneById: (id) => {
        const sql = 'SELECT minio_link link, status FROM rss_episode WHERE id=?';
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 查询指定订阅关联的全部剧集列表
     * @param {number} subsId - rss_subscribe 主键 ID
     * @returns {Promise<QueryResult<{ id: number, rssSubsId: number, rssTaskId: number, episode: number, link: string, status: string, taskStatus: string }>>}
     */
    selectBySubsId: (subsId) => {
        const sql = 'SELECT re.id, re.rss_subs_id, re.rss_task_id, re.episode, re.minio_link link, re.status status, rtt.status taskStatus ' +
            'FROM rss_episode re ' +
            'LEFT JOIN rss_torrent_task rtt on rtt.id=re.rss_task_id ' +
            'WHERE re.rss_subs_id=?';
        return __sqliteDB.selectAll(sql, [subsId], null, dbName);
    },

    /**
     * 检查某订阅下指定集数是否已存在
     * @param {number} subsId - 订阅 ID
     * @param {number|string} episode - 集数/话数
     * @returns {Promise<boolean>}
     */
    selectExistsBySubsIdAndEpisode: (subsId, episode) => {
        const sql = 'SELECT COUNT(1) as count FROM rss_episode WHERE rss_subs_id = ? AND episode = ?';
        return __sqliteDB.selectOne(sql, [subsId, episode], null, dbName).then(data => data.count > 0);
    },

    /**
     * 插入一条剧集记录（防重复插入）
     * @param {Object} rssEpisode - 剧集数据
     * @param {number} rssEpisode.rssTaskId - 关联任务 ID
     * @param {number} rssEpisode.rssSubsId - 关联订阅 ID
     * @param {number|string} rssEpisode.episode - 集数
     * @param {string} rssEpisode.minioLink - 对象存储链接
     * @param {string} [rssEpisode.status='0'] - 状态
     * @param {TransactionDB} [transactionDB] - 可选的事务句柄
     * @returns {Promise<ExecResult>}
     */
    insertOne: (rssEpisode, transactionDB) => {
        const sql = 'INSERT INTO rss_episode (rss_task_id, rss_subs_id, episode, minio_link, status) SELECT ?,?,?,?,? WHERE NOT EXISTS (' +
            'SELECT 1 FROM rss_episode WHERE rss_subs_id = ? AND episode = ?)';
        const params = [
            rssEpisode.rssTaskId,
            rssEpisode.rssSubsId,
            rssEpisode.episode,
            rssEpisode.minioLink,
            rssEpisode.status ?? '0',
            rssEpisode.rssSubsId,
            rssEpisode.episode
        ];
        return (transactionDB || __sqliteDB).insert(sql, params, null, dbName);
    },

    /**
     * 修改剧集状态
     * @param {number} id - 剧集 ID
     * @param {string} status - 目标状态
     * @returns {Promise<ExecResult>}
     */
    updateStatusById: (id, status) => {
        const sql = 'UPDATE rss_episode SET status = ? WHERE id = ?';
        return __sqliteDB.update(sql, [status, id], null, dbName);
    },

    /**
     * 物理删除剧集记录
     * @param {number} id - 剧集 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOneById: (id) => {
        const sql = 'DELETE FROM rss_episode WHERE id=?';
        return __sqliteDB.delete(sql, [id], null, dbName);
    },

    /**
     * 查询指定订阅下已就绪可播放的剧集播放列表
     * @param {number} rssSubsId - 订阅 ID
     * @returns {Promise<QueryResult<{ minioLink: string, title: string, episode: number }>>}
     */
    selectSourceBySubsIdAndEpisode: async (rssSubsId) => {
        const sql = `SELECT re.minio_link, rs.name AS title, re.episode `
            + `FROM rss_episode re `
            + `INNER JOIN rss_subscribe rs ON rs.id=re.rss_subs_id `
            + `WHERE re.rss_subs_id=? AND re.status=? AND re.minio_link IS NOT NULL`;
        return __sqliteDB.selectAll(sql, [rssSubsId, EPISODE_STATUS.COMPLETE], null, dbName);
    },

    /* ================= 失败/异常剧集 ================= */

    /**
     * 查询单个异常剧集详情
     * @param {number} id - 异常记录 ID
     * @returns {Promise<any|null>}
     */
    selectOneFailedById: id => {
        const sql = 'SELECT id, rss_task_id, rss_subs_id, episode, minio_link, root_path, file_name, reason, create_time FROM rss_episode_failed WHERE id=?';
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 查询指定订阅下的全部异常剧集列表
     * @param {number} subsId - 订阅 ID
     * @returns {Promise<QueryResult<any>>}
     */
    selectFailedBySubsId: (subsId) => {
        const sql = 'SELECT re.id, re.rss_subs_id, re.rss_task_id, re.episode, re.reason reason, re.create_time, re.file_name, re.root_path, re.minio_link AS link, rtt.status taskStatus ' +
            'FROM rss_episode_failed re ' +
            'LEFT JOIN rss_torrent_task rtt on rtt.id=re.rss_task_id ' +
            'WHERE re.rss_subs_id=?';
        return __sqliteDB.selectAll(sql, [subsId], null, dbName);
    },

    /**
     * 插入一条解析失败剧集记录
     * @param {Object} rssEpisodeFailed - 异常数据
     * @param {number} rssEpisodeFailed.rssTaskId - 关联任务 ID
     * @param {number} rssEpisodeFailed.rssSubsId - 关联订阅 ID
     * @param {number|string} rssEpisodeFailed.episode - 尝试解析的集数
     * @param {string} [rssEpisodeFailed.minioLink] - 目标链接
     * @param {string} rssEpisodeFailed.rootPath - 本地根路径
     * @param {string} rssEpisodeFailed.fileName - 文件名
     * @param {string} [rssEpisodeFailed.reason='0'] - 失败原因 (EPISODE_FAILED_REASON)
     * @param {TransactionDB} [transactionDB] - 可选的事务句柄
     * @returns {Promise<ExecResult>}
     */
    insertOneFailed: (rssEpisodeFailed, transactionDB) => {
        const sql = 'INSERT INTO rss_episode_failed (rss_task_id, rss_subs_id, episode, minio_link, root_path, file_name, reason, create_time) VALUES (?,?,?,?,?,?,?,?)';
        const params = [
            rssEpisodeFailed.rssTaskId,
            rssEpisodeFailed.rssSubsId,
            rssEpisodeFailed.episode,
            rssEpisodeFailed.minioLink,
            rssEpisodeFailed.rootPath,
            rssEpisodeFailed.fileName,
            rssEpisodeFailed.reason ?? '0',
            new Date()
        ];
        return (transactionDB || __sqliteDB).insert(sql, params, null, dbName);
    },

    /**
     * 更新异常剧集失败原因
     * @param {number} id - 异常记录 ID
     * @param {string} reason - 失败原因
     * @param {number|string} [episode] - 修正后的集数
     * @returns {Promise<ExecResult>}
     */
    updateFailedReasonById: (id, reason, episode) => {
        const params = [reason];
        let sql = 'UPDATE rss_episode_failed SET reason = ? ';
        if (episode) {
            sql += ', episode = ? ';
            params.push(episode);
        }
        sql += 'WHERE id = ?';
        params.push(id);
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 更新异常剧集的存储链接与失败原因
     * @param {number} id - 异常记录 ID
     * @param {string} minioLink - 存储链接
     * @param {string} reason - 原因
     * @param {number|string} [episode] - 集数
     * @returns {Promise<ExecResult>}
     */
    updateFailedMinioLinkAndReasonById: (id, minioLink, reason, episode) => {
        const params = [reason, minioLink];
        let sql = 'UPDATE rss_episode_failed SET reason = ?, minio_link = ? ';
        if (episode) {
            sql += ', episode = ? ';
            params.push(episode);
        }
        sql += 'WHERE id = ?';
        params.push(id);
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 修改异常剧集对应的本地文件名
     * @param {string} fileName - 新文件名
     * @param {number} id - 异常记录 ID
     * @returns {Promise<ExecResult>}
     */
    updateFailedEpisodeFileNameById: (fileName, id) => {
        const sql = `UPDATE rss_episode_failed SET file_name=? WHERE id=?`;
        return __sqliteDB.update(sql, [fileName, id], null, dbName);
    },

    /**
     * 修正异常剧集的核心信息
     * @param {Object} data - 修正数据
     * @param {number} data.id - 记录 ID
     * @param {number|string} [data.episode] - 修正集数
     * @param {string} [data.link] - 存储链接
     * @param {string} data.rootPath - 本地根路径
     * @param {string} data.fileName - 文件名
     * @returns {Promise<ExecResult>}
     */
    updateFailedEpisodeById: (data) => {
        const sql = 'UPDATE rss_episode_failed SET episode=?, minio_link=?, root_path=?, file_name=? WHERE id=? AND reason != 3';
        return __sqliteDB.update(sql, [
            data.episode ?? null,
            data.link ?? null,
            data.rootPath,
            data.fileName,
            data.id
        ], null, dbName);
    },

    /**
     * 物理删除异常记录
     * @param {number} id - 异常记录 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOneFailedById: id => {
        const sql = 'DELETE FROM rss_episode_failed WHERE id=?';
        return __sqliteDB.delete(sql, [id], null, dbName);
    },

    /**
     * 检查异常记录绑定的种子任务是否仍存在
     * @param {number} id - 异常记录 ID
     * @returns {Promise<boolean>}
     */
    selectFailedTaskExistsById: async id => {
        const sql = 'SELECT ref.id, COUNT(rt.id) count FROM rss_episode_failed ref INNER JOIN rss_torrent_task rt ON ref.rss_task_id=rt.id WHERE ref.id=? GROUP BY ref.id';
        return __sqliteDB.selectOne(sql, [id], null, dbName).then(data => (data?.count ?? 0) > 0);
    },

    /**
     * 查询未修复的异常剧集总数
     * @returns {Promise<number>}
     */
    selectFailedCount: async () => {
        const sql = `SELECT COUNT(*) AS count FROM rss_episode_failed WHERE reason!=${EPISODE_FAILED_REASON.SUCCESS}`;
        return __sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.count || 0);
    }
};