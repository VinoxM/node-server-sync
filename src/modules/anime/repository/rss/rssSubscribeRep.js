import { SUBSCRIBE_FIN_VALUE, SUBSCRIBE_GOON_VALUE, SUBSCRIBE_RESULT_HIDE_VALUE } from "#modules/anime/constants/subjectConstant.js";

const dbName = 'anime';

/**
 * 格式化处理名称字段（优先使用中文名）
 * @template T
 * @param {T} data
 * @returns {T}
 */
function handleName(data) {
    if (data) {
        return {
            ...data,
            name: __isNotBlank(data.nameCN) ? data.nameCN : data.name
        };
    }
    return data;
}

export default {
    /**
     * 根据传入的订阅ID集合查询 或 查询未完结番剧的订阅
     * @param {Array<number>} [subsIds] 订阅ID集合，为空时查询所有未完结订阅
     * @returns {Promise<QueryResult<{id: number, url: string, regex: string}>>}
     */
    selectForSubscribeUpdate: async (subsIds = []) => {
        const emptyIds = __isEmptyArray(subsIds);
        const params = emptyIds ? [] : subsIds;
        const sql = emptyIds ?
            `SELECT rs.id, rs.url, rs.regex FROM rss_subscribe rs INNER JOIN subjects s ON s.bangumi_id=rs.bangumi_id WHERE rs.fin=${SUBSCRIBE_FIN_VALUE.NO}` :
            `SELECT id, url, regex FROM rss_subscribe WHERE id IN (${subsIds.map(_ => '?').join(",")})`;
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 根据订阅ID查询订阅详情及关联条目信息
     * @param {number|string} id 订阅ID
     * @returns {Promise<{id: number, url: string, regex: string, fin: number, goon: number, name: string, nameCN: string, season: string}|null>}
     */
    selectOneById: async id => {
        const sql = `SELECT rs.id, rs.url, rs.regex, rs.fin, rs.goon, t.name, t.name_cn AS nameCN, t.season `
            + `FROM rss_subscribe rs `
            + `LEFT JOIN subjects t ON t.bangumi_id=rs.bangumi_id `
            + `WHERE rs.id=? `;
        const data = await __sqliteDB.selectOne(sql, [id], null, dbName);
        return handleName(data);
    },

    /**
     * 查询所有未完结订阅的番剧信息及其匹配结果总数
     * @returns {Promise<QueryResult<{id: number, name: string, nameCN: string, cover: string, counts: number}>>}
     */
    selectRssSubscribeCountsWithoutFin: async () => {
        const sql = `SELECT rs.id, t.name, t.name_cn AS nameCN, t.cover, COUNT(rr.id) AS counts `
            + `FROM rss_subscribe rs `
            + `LEFT JOIN subjects t ON t.bangumi_id=rs.bangumi_id `
            + `LEFT JOIN rss_result rr ON rs.id = rr.pid `
            + `WHERE rs.fin=${SUBSCRIBE_FIN_VALUE.NO} GROUP BY rs.id, t.name, nameCN, t.cover`;
        const res = await __sqliteDB.selectAll(sql, [], null, dbName);
        if (res.rows > 0) {
            return {
                rows: res.rows,
                data: res.data.map(handleName)
            };
        }
        return res;
    },

    /**
     * 根据订阅ID集合查询关联条目的总集数
     * @param {Array<number|string>} ids 订阅ID集合
     * @returns {Promise<QueryResult<{id: number, subsId: number, bangumiId: number, totalEpisodes: number}>>|{rows: 0, data: []}}
     */
    selectSubjectTotalEpisodesBySubsIds: ids => {
        if (__isEmptyArray(ids)) {
            return { rows: 0, data: [] };
        }
        const sql = `SELECT t.id, rs.id subsId, rs.bangumi_id, t.total_episodes `
            + `FROM rss_subscribe rs `
            + `INNER JOIN subjects t ON t.bangumi_id = rs.bangumi_id `
            + `WHERE rs.id IN (${ids.map(_ => '?').join(',')})`;
        return __sqliteDB.selectAll(sql, ids, null, dbName);
    },

    /**
     * 查询指定订阅在未完结状态下已匹配的所有集数
     * @param {number|string} id 订阅ID
     * @returns {Promise<QueryResult<{id: number, episode: number}>>}
     */
    selectSubscribeResultsEpisodes: id => {
        const sql = `SELECT rs.id, rr.episode `
            + `FROM rss_subscribe rs `
            + `INNER JOIN rss_result rr ON rr.pid=rs.id AND rr.hide=${SUBSCRIBE_RESULT_HIDE_VALUE.NO} `
            + `WHERE rs.id=? AND rs.fin=${SUBSCRIBE_FIN_VALUE.NO}`;
        return __sqliteDB.selectAll(sql, [id], null, dbName);
    },

    /**
     * 批量更新订阅的完结状态（完结时自动重置连载继续标志 goon=0）
     * @param {Array<number|string>} ids 订阅ID集合
     * @param {number} [fin=SUBSCRIBE_FIN_VALUE.YES] 完结状态 (0: 否, 1: 是)
     * @returns {Promise<{rows: number}>}
     */
    updateFinByIds: (ids, fin = SUBSCRIBE_FIN_VALUE.YES) => {
        let setupCause = `fin=?`;
        const params = [fin];
        if (fin === SUBSCRIBE_FIN_VALUE.YES) {
            params.push(SUBSCRIBE_GOON_VALUE.NO);
            setupCause += `,goon=?`;
        }
        const sql = `UPDATE rss_subscribe SET ${setupCause} WHERE id IN (${ids.map(_ => "?").join(',')})`;
        return __sqliteDB.update(sql, [...params, ...ids], null, dbName);
    },

    /**
     * 根据订阅ID集合查询季度、连载与完结状态
     * @param {Array<number|string>} ids 订阅ID集合
     * @returns {Promise<QueryResult<{id: number, season: string, goon: number, fin: number}>>}
     */
    selectGoonByIds: ids => {
        const sql = `SELECT rs.id, t.season, rs.goon, rs.fin `
            + `FROM rss_subscribe rs `
            + `INNER JOIN subjects t ON t.bangumi_id=rs.bangumi_id `
            + `WHERE rs.id IN (${ids.map(_ => '?').join(',')})`;
        return __sqliteDB.selectAll(sql, ids, null, dbName);
    },

    /**
     * 批量更新订阅的连载继续标志
     * @param {Array<number|string>} ids 订阅ID集合
     * @param {number} [goon=SUBSCRIBE_GOON_VALUE.YES] 连载继续标志 (0: 否, 1: 是)
     * @returns {Promise<{rows: number}>}
     */
    updateGoonByIds: (ids, goon = SUBSCRIBE_GOON_VALUE.YES) => {
        return __sqliteDB.update(`UPDATE rss_subscribe SET goon=? WHERE id IN (${ids.map(_ => "?").join(',')})`, [goon, ...ids], null, dbName);
    },
};