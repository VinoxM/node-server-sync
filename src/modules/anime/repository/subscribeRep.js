import { SUBSCRIBE_FIN_VALUE, SUBSCRIBE_GOON_VALUE } from "../constants/subjectConstant.js";

const dbName = 'anime';

const FULL_COLUMNS = [
    'id',
    'bangumi_id',
    'start_time',
    'url',
    'regex',
    'fin',
    'goon'
]

const INSERT_COLUMNS_LENGTH = FULL_COLUMNS.length - 1; // Exclude 'id' column
const BATCH_INSERT_PARAMS_LIMIT = 500;

async function insertAny(subscribes) {
    if (!subscribes || subscribes.length === 0) {
        return { rows: 0 }
    }
    const valueSql = `(${new Array(FULL_COLUMNS.length - 1).fill('?').join(',')})`;
    const sql = `INSERT OR IGNORE INTO rss_subscribe (${FULL_COLUMNS.slice(1).join(',')}) VALUES ${subscribes.map(() => valueSql).join(',')}`;
    const values = subscribes.flatMap(data => [
        data.bangumiId,
        data.startTime,
        data.url,
        data.regex,
        data.fin ?? SUBSCRIBE_FIN_VALUE.NO,
        data.goon ?? SUBSCRIBE_GOON_VALUE.NO
    ]);
    return __sqliteDB.insert(sql, values, null, dbName);
}

export default {
    insertOne: (subscribe) => insertAny([subscribe]),
    insertBatch: async (subscribes) => {
        const fullBatchSize = Math.floor(BATCH_INSERT_PARAMS_LIMIT / INSERT_COLUMNS_LENGTH);
        if (subscribes.length > fullBatchSize) {
            let totalInserted = 0;
            for (let i = 0; i < subscribes.length; i += fullBatchSize) {
                const batch = subscribes.slice(i, i + fullBatchSize)
                const { rows } = await insertAny(batch);
                totalInserted += rows;
            }
            return { rows: totalInserted };
        }
        return insertAny(subscribes);
    },
    updateOne: (data) => {
        const sql = `UPDATE rss_subscribe SET start_time = ?, url = ?, regex = ?, goon = ? WHERE bangumi_id = ?`;
        return __sqliteDB.update(sql, [
            data.season,
            data.startTime,
            data.url,
            data.regex,
            data.goon,
            data.bangumiId
        ], null, dbName);
    },
    deleteByBangumiId: (bangumiId) => {
        const sql = `DELETE FROM rss_subscribe WHERE bangumi_id = ?`;
        return __sqliteDB.delete(sql, [bangumiId], null, dbName);
    },
    selectByBangumiId: (bangumiId) => {
        const sql = `SELECT ${FULL_COLUMNS.join(",")} FROM rss_subscribe WHERE bangumi_id = ?`;
        return __sqliteDB.selectOne(sql, [bangumiId], null, dbName);
    },
    updateFinByBangumiId: (bangumiId, fin) => {
        const sql = `UPDATE rss_subscribe SET fin = ? WHERE bangumi_id = ?`;
        return __sqliteDB.update(sql, [fin, bangumiId], null, dbName);
    },
}