import { RSS_SUBTITLE_FILE_STATUS, RSS_SUBTITLE_STATUS } from "#modules/anime/constants/rssSubtitleStatusConst.js";

const dbName = 'anime';

const FULL_COLUMN = [
    'id',
    'rss_task_id',
    'rss_subs_id',
    'title',
    'episode',
    'minio_link',
    'root_path',
    'file_name',
    'fonts',
    'status',
    'file_status'
];

/**
 * 番剧 RSS 字幕文件及字体关联持久化仓储服务
 */
export default {
    /**
     * 检查指定文件名与本地根路径的字幕是否已记录
     * @param {string} fileName - 字幕相对文件名
     * @param {string} rootPath - 存储根路径
     * @returns {Promise<boolean>}
     */
    selectExistsByFileNameAndRootPath: (fileName, rootPath) => {
        const sql = `SELECT EXISTS(SELECT 1 FROM rss_episode_subtitle WHERE file_name = ? AND root_path = ? LIMIT 1) AS [exists]`;
        return __sqliteDB.selectOne(sql, [fileName, rootPath], null, dbName).then(res => Boolean(res?.exists));
    },

    /**
     * 插入一条字幕记录
     * @param {Object} subtitle - 字幕数据
     * @param {number} subtitle.taskId - 关联任务 ID
     * @param {number} subtitle.subsId - 关联订阅 ID
     * @param {string} subtitle.title - 字幕标题
     * @param {string|number} [subtitle.episode] - 关联话数
     * @param {string} [subtitle.minioLink] - 目标存储链接
     * @param {string} subtitle.rootPath - 本地根路径
     * @param {string} subtitle.fileName - 文件名
     * @param {string} [subtitle.fonts] - 引用字体列表字符串
     * @returns {Promise<ExecResult>}
     */
    insertOne: (subtitle) => {
        const sql = `INSERT INTO rss_episode_subtitle(rss_task_id, rss_subs_id, title, episode, minio_link, root_path, file_name, fonts, status, file_status) `
            + `VALUES(?,?,?,?,?,?,?,?,?,?)`;
        const params = [
            subtitle.taskId,
            subtitle.subsId,
            subtitle.title,
            subtitle.episode,
            subtitle.minioLink,
            subtitle.rootPath,
            subtitle.fileName,
            subtitle.fonts,
            RSS_SUBTITLE_STATUS.PREPARED,
            RSS_SUBTITLE_FILE_STATUS.EXISTS
        ];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 更新字幕同步状态
     * @param {number} id - 字幕 ID
     * @param {string} status - 目标状态 (RSS_SUBTITLE_STATUS)
     * @returns {Promise<ExecResult>}
     */
    updateSubtitleStatusById: (id, status) => {
        const sql = `UPDATE rss_episode_subtitle SET status=? WHERE id=?`;
        return __sqliteDB.update(sql, [status, id], null, dbName);
    },

    /**
     * 更新字幕本地物理文件存在状态
     * @param {number} id - 字幕 ID
     * @param {string} fileStatus - 本地物理文件状态 (RSS_SUBTITLE_FILE_STATUS)
     * @returns {Promise<ExecResult>}
     */
    updateSubtitleFileStatusById: (id, fileStatus) => {
        const sql = `UPDATE rss_episode_subtitle SET file_status=? WHERE id=?`;
        return __sqliteDB.update(sql, [fileStatus, id], null, dbName);
    },

    /**
     * 更新字幕 MinIO 存储链接
     * @param {number} id - 字幕 ID
     * @param {string} minioLink - 新链接
     * @returns {Promise<ExecResult>}
     */
    updateSubtitleMinioLinkById: (id, minioLink) => {
        const sql = `UPDATE rss_episode_subtitle SET minio_link=? WHERE id=?`;
        return __sqliteDB.update(sql, [minioLink, id], null, dbName);
    },

    /**
     * 更新字幕引用的字体列表
     * @param {number} id - 字幕 ID
     * @param {string} fonts - 逗号分隔的字体名称
     * @returns {Promise<ExecResult>}
     */
    updateSubtitleFontsById: (id, fonts) => {
        const sql = `UPDATE rss_episode_subtitle SET fonts=? WHERE id=?`;
        return __sqliteDB.update(sql, [fonts, id], null, dbName);
    },

    /**
     * 更新字幕标题
     * @param {number} id - 字幕 ID
     * @param {string} title - 标题
     * @returns {Promise<ExecResult>}
     */
    updateSubtitleTitleById: (id, title) => {
        const sql = `UPDATE rss_episode_subtitle SET title=? WHERE id=?`;
        return __sqliteDB.update(sql, [title, id], null, dbName);
    },

    /**
     * 更新字幕对应集数
     * @param {number} id - 字幕 ID
     * @param {string|number} episode - 集数
     * @returns {Promise<ExecResult>}
     */
    updateSubtitleEpisodeById: (id, episode) => {
        const sql = `UPDATE rss_episode_subtitle SET episode=? WHERE id=?`;
        return __sqliteDB.update(sql, [episode, id], null, dbName);
    },

    /**
     * 批量更新字幕属性
     * @param {Object} data - 字幕数据
     * @param {number} data.id - 字幕 ID
     * @param {string|number} [data.episode] - 话数
     * @param {string} [data.title] - 标题
     * @param {string} [data.fonts] - 字体列表
     * @param {string} [data.minioLink] - 存储链接
     * @returns {Promise<ExecResult>}
     */
    updateSubtitleById: (data) => {
        const sql = `UPDATE rss_episode_subtitle SET episode=?,title=?,fonts=?,minio_link=? WHERE id=?`;
        return __sqliteDB.update(sql, [
            data.episode ?? null,
            data.title ?? null,
            data.fonts ?? null,
            data.minioLink ?? null,
            data.id
        ], null, dbName);
    },

    /**
     * 根据主键 ID 查询字幕详情
     * @param {number} id - 字幕 ID
     * @returns {Promise<{ id: number, rssTaskId: number, rssSubsId: number, title: string, episode: string, minioLink: string, rootPath: string, fileName: string, fonts: string, status: string, fileStatus: string }|null>}
     */
    selectOneById: id => {
        const sql = `SELECT ${FULL_COLUMN.join(',')} FROM rss_episode_subtitle WHERE id=?`;
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 物理删除指定字幕记录
     * @param {number} id - 字幕 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOneById: id => {
        const sql = `DELETE FROM rss_episode_subtitle WHERE id=?`;
        return __sqliteDB.delete(sql, [id], null, dbName);
    },

    /**
     * 查询指定订阅关联的所有字幕列表
     * @param {number} rssSubsId - 订阅 ID
     * @returns {Promise<QueryResult<{ id: number, rssTaskId: number, rssSubsId: number, title: string, episode: string, minioLink: string, rootPath: string, fileName: string, fonts: string, status: string, fileStatus: string }>>}
     */
    selectBySubsId: rssSubsId => {
        const sql = `SELECT ${FULL_COLUMN.join(',')} FROM rss_episode_subtitle WHERE rss_subs_id=?`;
        return __sqliteDB.selectAll(sql, [rssSubsId], null, dbName);
    },

    /**
     * 查询指定订阅与集数下已处理完成 (COMPLETE) 的字幕列表
     * @param {number} rssSubsId - 订阅 ID
     * @param {string|number} episode - 集数
     * @returns {Promise<QueryResult<{ id: number, rssTaskId: number, rssSubsId: number, title: string, episode: string, minioLink: string, rootPath: string, fileName: string, fonts: string, status: string, fileStatus: string }>>}
     */
    selectBySubsIdAndEpisode: (rssSubsId, episode) => {
        const sql = `SELECT ${FULL_COLUMN.join(',')} FROM rss_episode_subtitle WHERE rss_subs_id=? AND episode=? AND status=?`;
        return __sqliteDB.selectAll(sql, [rssSubsId, episode, RSS_SUBTITLE_STATUS.COMPLETE], null, dbName);
    },

    /**
     * 查询处理失败的字幕数量
     * @returns {Promise<number>}
     */
    selectFailedCount: () => {
        const sql = `SELECT COUNT(*) AS count FROM rss_episode_subtitle WHERE status=${RSS_SUBTITLE_STATUS.FAILED}`;
        return __sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.count || 0);
    }
};