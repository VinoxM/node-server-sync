import { isCurSeason } from "#common/utils/dateUtil.js";
import { RSS_SUBTITLE_STATUS } from "#modules/anime/constants/rssSubtitleStatusConst.js";
import { EPISODE_FAILED_REASON } from "#modules/anime/constants/rssTaskStatusConst.js";
import { SUBJECT_HIDE_VALUE, SUBJECT_NSFW_VALUE, SUBJECT_PLATFORM_SEARCH_MAPPING, SUBSCRIBE_FIN_VALUE, SUBSCRIBE_GOON_VALUE, SUBSCRIBE_RESULT_HIDE_VALUE } from "#modules/anime/constants/subjectConstant.js";
import { SUBJECT_RESULT_MAP } from "../entity/subjectResultMap.js";

const dbName = 'anime';

const FULL_COLUMNS = SUBJECT_RESULT_MAP.map(({ column, property }) => `${column} AS ${property}`);

// Exclude 'id' column
const INSERT_COLUMN_OPTIONS = SUBJECT_RESULT_MAP.filter(m => m.column !== 'id');
const INSERT_COLUMNS = INSERT_COLUMN_OPTIONS.map(({ column }) => column);
const INSERT_COLUMNS_LENGTH = INSERT_COLUMN_OPTIONS.length;
const BATCH_INSERT_PARAMS_LIMIT = 500;

async function insertAny(subjects) {
    if (!subjects || subjects.length === 0) {
        return { rows: 0 };
    }
    const valueSql = `(${new Array(INSERT_COLUMNS.length).fill('?').join(',')})`;
    const sql = `INSERT OR IGNORE INTO subjects (${INSERT_COLUMNS.join(',')}) VALUES ${subjects.map(() => valueSql).join(',')}`;
    const values = subjects.flatMap(data => INSERT_COLUMN_OPTIONS.map(({ property, defaultValue }) => data?.[property] ?? defaultValue?.() ?? null));
    return __sqliteDB.insert(sql, values, null, dbName);
}

// Exclude 'id', 'bangumi_id', 'create_time' columns
const UPDATE_COLUMN_OPTIONS = SUBJECT_RESULT_MAP.filter(m => !['id', 'bangumi_id', 'create_time'].includes(m.column));
const BATCH_UPDATE_LIMIT = 500;

async function updateAny(subjects, updateColumns = []) {
    if (!subjects || subjects.length === 0) {
        return { rows: 0 };
    }
    const updateColumnOptions = __isNotEmptyArray(updateColumns)
        ? UPDATE_COLUMN_OPTIONS.filter(o => updateColumns.includes(o.column))
        : UPDATE_COLUMN_OPTIONS;
    const sql = `UPDATE subjects SET ${updateColumnOptions.map(c => `${c.column}=?`).join(",")} WHERE bangumi_id = ?`;
    const valuesArray = subjects.map(data => ({
        sql,
        params: [
            ...updateColumnOptions.map(({ property, defaultValue }) => data?.[property] ?? defaultValue?.() ?? null),
            data.bangumiId
        ]
    }));
    return __sqliteDB.updateBatch(valuesArray, null, dbName);
}

/**
 * 番剧条目 (subjects) 核心数据仓储服务
 */
export default {
    /**
     * 插入单条番剧条目
     * @param {import('#types/animeTypes.d.ts').CleanedSubject} subject - 清洗后的番剧数据
     * @returns {Promise<ExecResult>}
     */
    insertOne: (subject) => insertAny([subject]),

    /**
     * 批量插入番剧条目（自动按参数上限分批）
     * @param {Array<import('#types/animeTypes.d.ts').CleanedSubject>} subjects - 番剧数据列表
     * @returns {Promise<{ rows: number }>}
     */
    insertBatch: async (subjects) => {
        const fullBatchSize = Math.floor(BATCH_INSERT_PARAMS_LIMIT / INSERT_COLUMNS_LENGTH);
        let totalInserted = 0;
        for (let i = 0; i < subjects.length; i += fullBatchSize) {
            const batch = subjects.slice(i, i + fullBatchSize);
            const { rows } = await insertAny(batch);
            totalInserted += rows;
        }
        return { rows: totalInserted };
    },

    /**
     * 更新单个番剧条目
     * @param {import('#types/animeTypes.d.ts').CleanedSubject} subject - 番剧数据
     * @param {string[]} [updateColumns] - 指定更新的列名数组
     * @returns {Promise<ExecResult>}
     */
    updateOne: async (subject, updateColumns) => updateAny([subject], updateColumns),

    /**
     * 批量更新番剧条目
     * @param {Array<import('#types/animeTypes.d.ts').CleanedSubject>} subjects - 番剧列表
     * @param {string[]} [updateColumns] - 指定更新的列名数组
     * @returns {Promise<{ rows: number }>}
     */
    updateBatch: async (subjects, updateColumns) => {
        let totalUpdated = 0;
        for (let i = 0; i < subjects.length; i += BATCH_UPDATE_LIMIT) {
            const batch = subjects.slice(i, i + BATCH_UPDATE_LIMIT);
            const { rows } = await updateAny(batch, updateColumns);
            totalUpdated += rows;
        }
        return { rows: totalUpdated };
    },

    /**
     * 从给定的 Bangumi ID 列表中筛选出数据库中尚不存在的 ID 列表
     * @param {number[]} bangumiIds - 待检查的 ID 列表
     * @returns {Promise<number[]>} 库中不存在的 ID 列表
     */
    selectNotExistsByBangumiIds: async bangumiIds => {
        if (!bangumiIds || bangumiIds.length === 0) {
            return Promise.resolve([]);
        }
        const existingSubjects = [];
        const BATCH_LIMIT = 500;
        for (let i = 0; i < bangumiIds.length; i += BATCH_LIMIT) {
            const batch = bangumiIds.slice(i, i + BATCH_LIMIT);
            const placeholders = batch.map(() => '?').join(',');
            const sql = `SELECT bangumi_id FROM subjects WHERE bangumi_id IN (${placeholders})`;
            const { data: result } = await __sqliteDB.selectAll(sql, batch, null, dbName);
            existingSubjects.push(...result);
        }
        const existingBangumiIds = new Set(existingSubjects.map(subject => subject.bangumiId));
        return bangumiIds.filter(bangumiId => !existingBangumiIds.has(bangumiId));
    },

    /**
     * 检查单个 Bangumi ID 是否存在
     * @param {number} bangumiId - Bangumi ID
     * @returns {Promise<boolean>}
     */
    selectExistsByBangumiId: async bangumiId => {
        return __sqliteDB.selectOne(`SELECT EXISTS(SELECT 1 FROM subjects WHERE bangumi_id = ? LIMIT 1) AS [exists]`, [bangumiId], null, dbName)
            .then(data => Boolean(data?.exists));
    },

    /**
     * 根据主键 ID 获取完整实体属性
     * @param {number} id - 主键 ID
     * @returns {Promise<any|null>}
     */
    selectOneById: id => {
        return __sqliteDB.selectOne(`SELECT ${FULL_COLUMNS.join(',')} FROM subjects WHERE id=?`, [id], null, dbName);
    },

    /**
     * 根据 Bangumi ID 列表获取完整实体属性
     * @param {Array<number>} bangumiIds - Bangumi ID 列表
     * @returns {Promise<any|null>}
     */
    selectByBangumiIds: bangumiIds => {
        if (__isEmptyArray(bangumiIds)) return { rows: 0, data: [] };
        return __sqliteDB.selectAll(`SELECT ${FULL_COLUMNS.join(',')} FROM subjects WHERE bangumi_id IN (${bangumiIds.map(_ => '?').join(',')})`, bangumiIds, null, dbName);
    },

    /**
     * 根据主键 ID 获取前台展示用的条目与订阅关联明细
     * @param {number} id - 主键 ID
     * @returns {Promise<any|null>}
     */
    selectOneByIdForView: id => {
        const sql = `SELECT ${FULL_COLUMNS.map(c => 't.' + c).join(',')}, `
            + `rs.id AS subsId, rs.start_time, rs.fin FROM subjects t `
            + `INNER JOIN rss_subscribe rs ON rs.bangumi_id = t.bangumi_id `
            + `WHERE t.id=? AND t.hide=?`;
        return __sqliteDB.selectOne(sql, [id, SUBJECT_HIDE_VALUE.NO], null, dbName);
    },

    /**
     * 更新条目隐藏状态
     * @param {number} hide - 目标隐藏值 (SUBJECT_HIDE_VALUE)
     * @param {number} id - 条目 ID
     * @param {number} originHide - 原隐藏值
     * @returns {Promise<ExecResult>}
     */
    updateSubjectHide: (hide, id, originHide) => {
        return __sqliteDB.update(`UPDATE subjects SET hide=? WHERE id=? AND hide=?`, [hide, id, originHide], null, dbName);
    },

    /**
     * 修改条目所属季度
     * @param {string} season - 季度 (如 '2026-10')
     * @param {number} id - 条目 ID
     * @returns {Promise<ExecResult>}
     */
    updateSeasonById: (season, id) => {
        return __sqliteDB.update(`UPDATE subjects SET season=? WHERE id=?`, [season, id], null, dbName);
    },

    /**
     * 修改条目所属放送平台类型
     * @param {string} platform - 平台类型 (如 'tv', 'web', 'movie')
     * @param {number} id - 条目 ID
     * @returns {Promise<ExecResult>}
     */
    updateSubjectPlatform: (platform, id) => {
        return __sqliteDB.update(`UPDATE subjects SET platform=? WHERE id=?`, [platform, id], null, dbName);
    },

    /**
     * 物理删除指定条目
     * @param {number} id - 条目 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOneById: id => {
        return __sqliteDB.delete(`DELETE FROM subjects WHERE id=?`, [id], null, dbName);
    },

    /**
     * 查询指定季度下可见的番剧列表（包含当季新作与跨季续播作品）
     * @param {string} season - 季度字符串 (如 '2026-10')
     * @returns {Promise<QueryResult<any>>}
     */
    selectVisibleBySeason: (season) => {
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.name_alias, t.platform, t.air_date, t.season, t.total_episodes, t.cover, t.meta_tags, t.nsfw, `
            + `rs.id AS subsId, rs.fin, rs.start_time, `
            + 'CASE WHEN rs.goon = 0 OR t.season = ? THEN 0 ELSE 1 END AS goon, '
            + 'MAX(rr.pub_date) lastPub, MAX(rr.episode) latestEp, COUNT(DISTINCT rr.episode) count '
            + 'FROM subjects t '
            + 'INNER JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + `LEFT JOIN rss_result rr ON rr.pid=rs.id AND rr.hide=${SUBSCRIBE_RESULT_HIDE_VALUE.NO} `
            + `WHERE t.hide=${SUBJECT_HIDE_VALUE.NO} `
            + `AND (t.season=? OR (rs.fin=${SUBSCRIBE_FIN_VALUE.NO} AND rs.goon=${SUBSCRIBE_GOON_VALUE.YES} AND t.season<?)) `
            + 'GROUP BY t.id,rs.id ';
        const params = [season, season, season];
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 根据订阅 ID 查询对应的可见番剧名称
     * @param {number} subsId - 订阅 ID
     * @returns {Promise<{ id: number, name: string, nameCN: string }|null>}
     */
    selectOneVisibleBySubsId: async subsId => {
        const sql = `SELECT t.id, t.name, t.name_cn AS nameCN FROM rss_subscribe rs INNER JOIN subjects t ON t.bangumi_id=rs.bangumi_id WHERE rs.id = ? AND t.hide=${SUBJECT_HIDE_VALUE.NO}`;
        return __sqliteDB.selectOne(sql, [subsId], null, dbName);
    },

    /**
     * 多条件分页过滤查询可见番剧列表
     * @param {Object} filters - 过滤条件
     * @param {string} [filters.season] - 季度
     * @param {string} [filters.platform] - 平台
     * @param {string} [filters.name] - 名称模糊搜索
     * @param {number|string} [filters.fin] - 完结状态
     * @param {boolean} [includeNsfw=false] - 是否包含 NSFW 内容
     * @param {number} [pageNum] - 当前页码
     * @param {number} [pageSize] - 每页条数
     * @returns {Promise<QueryResult<any>>}
     */
    selectVisibleByFilters: (filters, includeNsfw = false, pageNum, pageSize) => {
        const { season, platform, name, fin } = filters;
        const whereCause = [` t.hide=${SUBJECT_HIDE_VALUE.NO} `], params = [];
        if (__isNotBlank(season)) {
            whereCause.push(' t.season=? ');
            params.push(season);
        }
        if (__isNotBlank(name)) {
            whereCause.push(' (t.name LIKE ? OR t.name_cn LIKE ?) ');
            const nameLikely = `%${name}%`;
            params.push(nameLikely, nameLikely);
        }
        if (!__isAnyBlank(platform, SUBJECT_PLATFORM_SEARCH_MAPPING[platform])) {
            const platformParam = SUBJECT_PLATFORM_SEARCH_MAPPING[platform];
            if (Array.isArray(platformParam)) {
                whereCause.push(` t.platform IN (${platformParam.map(_ => '?').join(',')}) `);
                params.push(...platformParam);
            } else {
                whereCause.push(` t.platform=? `);
                params.push(platformParam);
            }
        }
        if (__isNotBlank(fin)) {
            whereCause.push(' rs.fin=? ');
            params.push(fin);
        }
        if (!includeNsfw) {
            whereCause.push(` t.nsfw=${SUBJECT_NSFW_VALUE.NO} `);
        }
        let limitOffset = '';
        if (pageNum !== undefined && pageSize !== undefined) {
            const offset = (pageNum - 1) * pageSize;
            limitOffset = ' LIMIT ' + pageSize + ' OFFSET ' + offset;
        }
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.name_alias, t.platform, t.air_date, t.season, t.total_episodes, t.cover, t.meta_tags, t.nsfw, `
            + `rs.id AS subsId, rs.fin, rs.start_time, `
            + 'MAX(rr.pub_date) lastPub, MAX(rr.episode) latestEp, COUNT(DISTINCT rr.episode) count '
            + 'FROM subjects t '
            + 'INNER JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + `LEFT JOIN rss_result rr ON rr.pid=rs.id AND rr.hide=${SUBSCRIBE_RESULT_HIDE_VALUE.NO} `
            + `WHERE${whereCause.join('AND')}`
            + 'GROUP BY t.id,rs.id ORDER BY t.id,rs.id '
            + limitOffset;
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 多条件过滤查询可见番剧总数
     * @param {Object} filters - 过滤条件
     * @param {string} [filters.season] - 季度
     * @param {string} [filters.platform] - 平台
     * @param {string} [filters.name] - 名称模糊搜索
     * @param {number|string} [filters.fin] - 完结状态
     * @param {boolean} [includeNsfw=false] - 是否包含 NSFW
     * @returns {Promise<number>}
     */
    selectVisibleByFiltersCount: async (filters, includeNsfw = false) => {
        const { season, platform, name, fin } = filters;
        const whereCause = [` t.hide=${SUBJECT_HIDE_VALUE.NO} `], params = [];
        if (__isNotBlank(season)) {
            whereCause.push(' t.season=? ');
            params.push(season);
        }
        if (__isNotBlank(name)) {
            whereCause.push(' (t.name LIKE ? OR t.name_cn LIKE ?) ');
            const nameLikely = `%${name}%`;
            params.push(nameLikely, nameLikely);
        }
        if (!__isAnyBlank(platform, SUBJECT_PLATFORM_SEARCH_MAPPING[platform])) {
            const platformParam = SUBJECT_PLATFORM_SEARCH_MAPPING[platform];
            if (Array.isArray(platformParam)) {
                whereCause.push(` t.platform IN (${platformParam.map(_ => '?').join(',')}) `);
                params.push(...platformParam);
            } else {
                whereCause.push(` t.platform=? `);
                params.push(platformParam);
            }
        }
        if (__isNotBlank(fin)) {
            whereCause.push(' rs.fin=? ');
            params.push(fin);
        }
        if (!includeNsfw) {
            whereCause.push(` t.nsfw=${SUBJECT_NSFW_VALUE.NO} `);
        }
        const sql = `SELECT COUNT(t.id) as counts `
            + 'FROM subjects t '
            + 'INNER JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + `WHERE${whereCause.join('AND')}`;
        return __sqliteDB.selectOne(sql, params, null, dbName).then(data => data?.counts ?? 0);
    },

    /**
     * 根据订阅 ID 列表批量查询可见番剧列表
     * @param {number[]} subsIds - 订阅 ID 列表
     * @returns {Promise<QueryResult<any>>}
     */
    selectVisibleBySubsIds: (subsIds) => {
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.name_alias, t.platform, t.air_date, t.season, t.total_episodes, t.cover, t.meta_tags, t.nsfw, `
            + `rs.id AS subsId, rs.fin, rs.start_time, `
            + 'MAX(rr.pub_date) lastPub, MAX(rr.episode) latestEp, COUNT(DISTINCT rr.episode) count '
            + 'FROM subjects t '
            + 'INNER JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + `LEFT JOIN rss_result rr ON rr.pid=rs.id AND rr.hide=${SUBSCRIBE_RESULT_HIDE_VALUE.NO} `
            + `WHERE t.hide=${SUBJECT_HIDE_VALUE.NO} `
            + `AND rs.id IN (${subsIds.map(_ => '?').join(',')}) `
            + 'GROUP BY t.id,rs.id ';
        return __sqliteDB.selectAll(sql, subsIds, null, dbName);
    },

    /**
     * 根据番剧 ID 列表批量查询可见番剧列表
     * @param {number[]} subjectIds - 番剧 ID 列表
     * @returns {Promise<QueryResult<any>>}
     */
    selectVisibleBySubjectIds: (subjectIds) => {
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.name_alias, t.platform, t.air_date, t.cover, t.meta_tags, t.nsfw, rs.id AS subsId `
            + 'FROM subjects t '
            + 'INNER JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + `WHERE t.hide=${SUBJECT_HIDE_VALUE.NO} `
            + `AND t.id IN (${subjectIds.map(_ => '?').join(',')}) `
            + 'GROUP BY t.id,rs.id ';
        return __sqliteDB.selectAll(sql, subjectIds, null, dbName);
    },

    /**
     * 根据番剧 Bangumi ID 列表批量查询可见番剧列表
     * @param {number[]} bangumiIds - 番剧 Bangumi ID 列表
     * @returns {Promise<QueryResult<any>>}
     */
    selectVisibleByBangumiIds: (bangumiIds, season) => {
        const params = [...bangumiIds];
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.name_alias, t.platform, t.air_date, t.season, t.total_episodes, t.cover, t.meta_tags, t.nsfw, `
            + `rs.id AS subsId, rs.fin, rs.start_time, `
            + 'MAX(rr.pub_date) lastPub, MAX(rr.episode) latestEp, COUNT(DISTINCT rr.episode) count '
            + 'FROM subjects t '
            + 'INNER JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + `LEFT JOIN rss_result rr ON rr.pid=rs.id AND rr.hide=${SUBSCRIBE_RESULT_HIDE_VALUE.NO} `
            + `WHERE t.hide=${SUBJECT_HIDE_VALUE.NO} `
            + `AND t.bangumi_id IN (${bangumiIds.map(_ => '?').join(',')}) `
            + (__isNotBlank(season) ? (params.push(season), 'AND t.season=? ') : '')
            + 'GROUP BY t.id,rs.id ';
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 查询已存在的所有季节列表
     * @returns {Promise<QueryResult<{ season: string }>>}
     */
    selectAllSeasons: () => {
        return __sqliteDB.selectAll(`SELECT season FROM subjects GROUP BY season`, [], null, dbName);
    },

    /**
     * 根据季度与名称条件查询番剧全量信息（包含异常剧集与异常字幕统计）
     * @param {string} [season] - 季度
     * @param {string} [name] - 标题模糊搜索
     * @returns {Promise<QueryResult<any>>}
     */
    selectAllBySeasonAndName: (season, name) => {
        let queryCase = '', whereCause = [], whereJoin = 'AND';
        const params = [];
        if (__isNotBlank(season)) {
            queryCase = ', CASE WHEN rs.goon = 0 OR t.season = ? THEN 0 ELSE 1 END AS goon ';
            whereCause.push(' t.season=? ');
            params.push(season, season);
        }
        if (__isNotBlank(name)) {
            whereCause.push(' (t.name LIKE ? OR t.name_cn LIKE ?) ');
            const nameLikely = `%${name}%`;
            params.push(nameLikely, nameLikely);
        } else if (isCurSeason(season)) {
            whereCause.push(` (rs.fin=${SUBSCRIBE_FIN_VALUE.NO} AND rs.goon=${SUBSCRIBE_GOON_VALUE.YES} AND t.season<?) `);
            params.push(season);
            whereJoin = 'OR';
        }
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.platform, t.air_date, t.season, t.total_episodes, t.cover, t.meta_tags, t.nsfw, t.hide, `
            + `rs.id AS subsId, rs.fin, rs.start_time, `
            + 'MAX(rr.pub_date) lastPub, MAX(rr.episode) latestEp, COUNT(DISTINCT rr.episode) count, '
            + 'COUNT(ef.id) failedEpisode, COUNT(es.id) failedSubtitle '
            + queryCase
            + 'FROM subjects t '
            + 'LEFT JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + 'LEFT JOIN rss_result rr ON rr.pid=rs.id '
            + `LEFT JOIN rss_episode_failed ef ON rs.id = ef.rss_subs_id AND ef.reason!=${EPISODE_FAILED_REASON.SUCCESS} `
            + `LEFT JOIN rss_episode_subtitle es ON rs.id = es.rss_subs_id AND es.status=${RSS_SUBTITLE_STATUS.FAILED} `
            + `WHERE${whereCause.join(whereJoin)}`
            + `GROUP BY t.id, subsId`;
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 根据主键 ID 与季度查询单条番剧详情（含异常统计）
     * @param {number} id - 主键 ID
     * @param {string} [season] - 季度
     * @returns {Promise<any|null>}
     */
    selectOneByIdAndSeason: (id, season) => {
        let queryCase = '';
        const params = [];
        if (__isNotBlank(season)) {
            queryCase = ', CASE WHEN rs.goon = 0 OR t.season = ? THEN 0 ELSE 1 END AS goon ';
            params.push(season);
        }
        params.push(id);
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.platform, t.air_date, t.season, t.total_episodes, t.cover, t.meta_tags, t.nsfw, t.hide, `
            + `rs.id AS subsId, rs.fin, rs.start_time, `
            + 'MAX(rr.pub_date) lastPub, MAX(rr.episode) latestEp, COUNT(DISTINCT rr.episode) count, '
            + 'COUNT(ef.id) failedEpisode, COUNT(es.id) failedSubtitle '
            + queryCase
            + 'FROM subjects t '
            + 'LEFT JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + 'LEFT JOIN rss_result rr ON rr.pid=rs.id '
            + `LEFT JOIN rss_episode_failed ef ON rs.id = ef.rss_subs_id AND ef.reason!=${EPISODE_FAILED_REASON.SUCCESS} `
            + `LEFT JOIN rss_episode_subtitle es ON rs.id = es.rss_subs_id AND es.status=${RSS_SUBTITLE_STATUS.FAILED} `
            + `WHERE t.id=? `
            + `GROUP BY t.id, subsId`;
        return __sqliteDB.selectOne(sql, params, null, dbName);
    },

    /**
     * 查询尚未完结（需执行元数据 Diff 对比同步）的番剧列表
     * @param {string} curSeason - 当前季度 (如 '2026-10')
     * @returns {Promise<QueryResult<{ id: number, bangumiId: number, name: string, nameCN: string, nameAlias: string, platform: string, airDate: string, summary: string, summaryCN: string, totalEpisodes: number, metaTags: string, staff: string, characters: string }>>}
     */
    selectNotFinSubjectsForDiff: (curSeason) => {
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.name_alias, t.platform, t.air_date, t.summary, t.summary_cn AS summaryCN, t.total_episodes, t.meta_tags, t.staff, t.characters `
            + `FROM subjects t `
            + `INNER JOIN rss_subscribe rs ON t.bangumi_id = rs.bangumi_id AND rs.fin = ${SUBSCRIBE_FIN_VALUE.NO} `
            + `WHERE t.season <= ?`;
        return __sqliteDB.selectAll(sql, [curSeason], null, dbName);
    }
};