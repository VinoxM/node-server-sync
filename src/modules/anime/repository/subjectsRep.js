import { SUBJECT_HIDE_VALUE, SUBSCRIBE_FIN_VALUE, SUBSCRIBE_GOON_VALUE, SUBSCRIBE_RESULT_HIDE_VALUE } from "../constants/subjectConstant.js";
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

// Exclude 'id', 'bangumi_id', 'update_time' columns
const UPDATE_COLUMN_OPTIONS = SUBJECT_RESULT_MAP.filter(m => !['id', 'bangumi_id', 'update_time'].includes(m.column));
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
     * @param {import('@types/animeTypes.d.ts').CleanedSubject} subject - 清洗后的番剧数据
     * @returns {Promise<ExecResult>}
     */
    insertOne: (subject) => insertAny([subject]),

    /**
     * 批量插入番剧条目（自动按参数上限分批）
     * @param {Array<import('@types/animeTypes.d.ts').CleanedSubject>} subjects - 番剧数据列表
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
     * @param {import('@types/animeTypes.d.ts').CleanedSubject} subject - 番剧数据
     * @param {string[]} [updateColumns] - 指定更新的列名数组
     * @returns {Promise<ExecResult>}
     */
    updateOne: async (subject, updateColumns) => updateAny([subject], updateColumns),

    /**
     * 批量更新番剧条目
     * @param {Array<import('@types/animeTypes.d.ts').CleanedSubject>} subjects - 番剧列表
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
     * @param {number} hide - 目标隐藏值
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
        const sql = `SELECT t.id, t.bangumi_id, t.name, t.name_cn AS nameCN, t.name_alias, t.platform, t.air_date, t.season, t.total_episodes, t.cover, t.meta_tags, rs.id AS subsId, rs.fin, rs.start_time, `
            + 'CASE WHEN rs.goon = 0 OR t.season = ? THEN 0 ELSE 1 END AS goon, '
            + 'MAX(rr.pub_date) lastPub, MAX(rr.sort) latestSort, MAX(rr.episode) latestEp, COUNT(rr.id) count, '
            + `CASE WHEN julianday('now') - julianday(MAX(rr.pub_date)) < 1 then 1 else 0 end hasNew `
            + 'FROM subjects t '
            + 'INNER JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + `LEFT JOIN rss_result rr ON rr.pid=rs.id AND rr.hide=${SUBSCRIBE_RESULT_HIDE_VALUE.NO} `
            + `WHERE t.nsfw=0 AND (t.season=? AND t.hide=${SUBJECT_HIDE_VALUE.NO}) `
            + `OR (rs.fin=${SUBSCRIBE_FIN_VALUE.NO} AND rs.goon=${SUBSCRIBE_GOON_VALUE.YES} AND t.season<?) `
            + 'GROUP BY t.id ';
        const params = [season, season, season];
        return __sqliteDB.selectAll(sql, params, null, dbName);
    }
};