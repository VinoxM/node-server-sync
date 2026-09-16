import { LRUCache } from "#core/infra/extendMap.js";

const dbName = 'anime';

const taskCache = new LRUCache(100);

function getFromCache(ids) {
    const excludes = [];
    const results = [];
    Array.from(ids).forEach(id => {
        if (taskCache.has(id)) {
            results.push({ id, ...taskCache.get(id) });
        } else {
            excludes.push(id);
        }
    });
    return { excludes, results };
}

function saveCache(results) {
    const arr = Array.from(results).filter(r => Boolean(r.hash));
    arr.forEach(res => {
        const { id, ...val } = res;
        taskCache.set(id, val);
    });
}

/**
 * RSS 种子下载任务持久化仓储服务
 */
export default {
    /**
     * 根据订阅 ID 查询关联的种子下载任务列表
     * @param {number} subsId - 订阅 ID
     * @returns {Promise<QueryResult<{ id: number, rssSubsId: number, rssResultId: number, status: string }>>}
     */
    selectBySubsId: (subsId) => {
        const sql = 'SELECT id, rss_subs_id, rss_result_id, status FROM rss_torrent_task ' +
            'WHERE rss_subs_id = ?';
        return __sqliteDB.selectAll(sql, [subsId], null, dbName);
    },

    /**
     * 根据订阅 ID 查询任务列表及关联的抓取结果条目详细信息
     * @param {number} subsId - 订阅 ID
     * @returns {Promise<QueryResult<{ id: number, rssSubsId: number, rssResultId: number, status: string, title: string, episode: string, pubDate: string, hide: number }>>}
     */
    selectBySubsIdWithResultExists: (subsId) => {
        const sql = 'SELECT rtt.id, rtt.rss_subs_id, rtt.rss_result_id, rtt.status, rr.title, rr.episode, rr.pub_date, rr.hide ' +
            'FROM rss_torrent_task rtt ' +
            'LEFT JOIN rss_result rr ON rr.id=rtt.rss_result_id ' +
            'WHERE rtt.rss_subs_id = ?';
        return __sqliteDB.selectAll(sql, [subsId], null, dbName);
    },

    /**
     * 检查抓取结果是否已经创建过下载任务
     * @param {number} rssResultId - 抓取结果 ID
     * @returns {Promise<boolean>}
     */
    selectExistsByResultId: (rssResultId) => {
        const sql = 'SELECT COUNT(id) count FROM rss_torrent_task WHERE rss_result_id=?';
        return __sqliteDB.selectOne(sql, [rssResultId], null, dbName).then(data => (data?.count ?? 0) > 0);
    },

    /**
     * 根据任务 UUID 查询任务记录
     * @param {string} uuid - qBittorrent 任务 UUID
     * @returns {Promise<{ id: number, rssSubsId: number, rssResultId: number, uuid: string, hash: string, status: string }|null>}
     */
    selectByUUID: (uuid) => {
        const sql = 'SELECT id, rss_subs_id as rssSubsId, rss_result_id as rssResultId, torrent_uuid as uuid, torrent_hash as hash, status FROM rss_torrent_task ' +
            'WHERE torrent_uuid = ?';
        return __sqliteDB.selectOne(sql, [uuid], null, dbName);
    },

    /**
     * 插入一条新的下载任务记录
     * @param {Object} rssTask - 任务数据
     * @param {number} rssTask.rssSubsId - 订阅 ID
     * @param {number} rssTask.resultId - 抓取条目 ID
     * @param {string} [rssTask.uuid] - 客户端任务 UUID
     * @param {string} [rssTask.hash] - 种子 Hash
     * @param {string} [rssTask.status='0'] - 任务状态
     * @param {TransactionDB} [transactionDB] - 可选的事务句柄
     * @returns {Promise<ExecResult>}
     */
    insertOne: (rssTask, transactionDB) => {
        const sql = 'INSERT INTO rss_torrent_task (rss_subs_id, rss_result_id, torrent_uuid, torrent_hash, status) VALUES (?,?,?,?,?)';
        const params = [rssTask.rssSubsId, rssTask.resultId, rssTask.uuid ?? null, rssTask.hash ?? null, rssTask.status ?? '0'];
        return (transactionDB || __sqliteDB).insert(sql, params, null, dbName);
    },

    /**
     * 根据 UUID 更新任务状态
     * @param {string} uuid - 任务 UUID
     * @param {string} status - 目标状态
     * @returns {Promise<ExecResult>}
     */
    updateStatusByUUID: (uuid, status) => {
        const sql = 'UPDATE rss_torrent_task SET status = ? WHERE torrent_uuid = ?';
        return __sqliteDB.update(sql, [status, uuid], null, dbName);
    },

    /**
     * 根据主键 ID 更新任务状态
     * @param {number} id - 任务 ID
     * @param {string} status - 目标状态
     * @returns {Promise<ExecResult>}
     */
    updateStatusById: (id, status) => {
        const sql = 'UPDATE rss_torrent_task SET status = ? WHERE id = ?';
        return __sqliteDB.update(sql, [status, id], null, dbName);
    },

    /**
     * 更新任务关联的种子 Hash
     * @param {number} id - 任务 ID
     * @param {string} hash - 种子 Hash
     * @returns {Promise<ExecResult>}
     */
    updateTaskHashById: (id, hash) => {
        const sql = 'UPDATE rss_torrent_task SET torrent_hash = ? WHERE id = ?';
        return __sqliteDB.update(sql, [hash, id], null, dbName);
    },

    /**
     * 根据 ID 列表批量查询任务信息（带 LRU 缓存）
     * @param {number[]} ids - 任务 ID 列表
     * @returns {Promise<Array<{ id: number, hash: string, uuid: string }>>}
     */
    selectByIds: async (ids) => {
        const { results, excludes } = getFromCache(ids);
        if (excludes.length > 0) {
            const sql = 'SELECT id,torrent_hash AS hash,torrent_uuid AS uuid FROM rss_torrent_task WHERE id IN (' + new Array(excludes.length).fill('?').join(',') + ')';
            const data = await __sqliteDB.selectAll(sql, excludes, null, dbName).then(({ data }) => data);
            if (data.length > 0) {
                saveCache(data);
                results.push(...data);
            }
        }
        return results;
    },

    /**
     * 查询单条任务的状态、Hash 与 UUID
     * @param {number} id - 任务 ID
     * @returns {Promise<{ id: number, status: string, hash: string, uuid: string }|null>}
     */
    selectOneStatusById: id => {
        const sql = 'SELECT id, status, torrent_hash hash, torrent_uuid uuid FROM rss_torrent_task WHERE id=?';
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 物理删除指定任务记录
     * @param {number} id - 任务 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOneById: id => {
        const sql = 'DELETE FROM rss_torrent_task WHERE id=?';
        return __sqliteDB.delete(sql, [id], null, dbName);
    }
};