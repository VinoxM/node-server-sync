import { LRUCache } from "../../../core/infra/extendMap.js"

const dbName = 'rss'
const enablePrint = { print: true }

const taskCache = new LRUCache(100)

function getFromCache(ids) {
    const excludes = []
    const results = []
    Array.from(ids).forEach(id => {
        if (taskCache.has(id)) {
            results.push({ id, ...taskCache.get(id) })
        } else {
            excludes.push(id)
        }
    })
    return { excludes, results }
}

function saveCache(results) {
    const arr = Array.from(results).filter(r => !!r.hash)
    arr.forEach(res => {
        const { id, ...val } = res
        taskCache.set(id, val)
    })
}

export default {
    selectBySubsId: (subsId) => {
        const sql = 'SELECT id, rss_subs_id, rss_result_id, status FROM rss_torrent_task ' +
            'WHERE rss_subs_id = ?'
        return __sqliteDB.selectAll(sql, [subsId], null, dbName)
    },
    selectBySubsIdWithResultExists: (subsId) => {
        const sql = 'SELECT rtt.id, rtt.rss_subs_id, rtt.rss_result_id, rtt.status, rr.title, rr.episode, rr.pub_date, rr.hide ' +
            'FROM rss_torrent_task rtt ' +
            'LEFT JOIN rss_result rr ON rr.id=rtt.rss_result_id ' +
            'WHERE rtt.rss_subs_id = ?'
        return __sqliteDB.selectAll(sql, [subsId], null, dbName)
    },
    selectExistsByResultId: (rssResultId) => {
        const sql = 'SELECT COUNT(id) count FROM rss_torrent_task WHERE rss_result_id=?'
        return __sqliteDB.selectOne(sql, [rssResultId], null, dbName).then(data => data.count > 0)
    },
    selectByUUID: (uuid) => {
        const sql = 'SELECT id, rss_subs_id as rssSubsId, rss_result_id as rssResultId, torrent_uuid as uuid, torrent_hash as hash, status FROM rss_torrent_task ' +
            'WHERE torrent_uuid = ?'
        return __sqliteDB.selectOne(sql, [uuid], null, dbName)
    },
    insertOne: (rssTask, transactionDB) => {
        const sql = 'INSERT INTO rss_torrent_task (rss_subs_id, rss_result_id, torrent_uuid, torrent_hash, status) VALUES (?,?,?,?,?)'
        const params = [rssTask.rssSubsId, rssTask.resultId, rssTask.uuid ?? null, rssTask.hash ?? null, rssTask.status ?? '0']
        return (transactionDB || __sqliteDB).insert(sql, params, null, dbName)
    },
    updateStatusByUUID: (uuid, status) => {
        const sql = 'UPDATE rss_torrent_task SET status = ? WHERE torrent_uuid = ?'
        return __sqliteDB.update(sql, [status, uuid], null, dbName)
    },
    updateStatusById: (id, status) => {
        const sql = 'UPDATE rss_torrent_task SET status = ? WHERE id = ?'
        return __sqliteDB.update(sql, [status, id], null, dbName)
    },
    updateTaskHashById: (id, hash) => {
        const sql = 'UPDATE rss_torrent_task SET torrent_hash = ? WHERE id = ?'
        return __sqliteDB.update(sql, [hash, id], null, dbName)
    },
    selectByIds: async (ids) => {
        const { results, excludes } = getFromCache(ids)
        if (excludes.length > 0) {
            const sql = 'SELECT id,torrent_hash AS hash,torrent_uuid AS uuid FROM rss_torrent_task WHERE id IN (' + new Array(excludes.length).fill('?').join(',') + ')'
            const data = await __sqliteDB.selectAll(sql, excludes, null, dbName).then(({ data }) => data)
            if (data.length > 0) {
                saveCache(data)
                results.push(...data)
            }
        }
        return results;
    },
    selectOneStatusById: id => {
        const sql = 'SELECT id, status, torrent_hash hash, torrent_uuid uuid FROM rss_torrent_task WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    deleteOneById: id => {
        const sql = 'DELETE FROM rss_torrent_task WHERE id=?'
        return __sqliteDB.delete(sql, [id], null, dbName)
    }
}