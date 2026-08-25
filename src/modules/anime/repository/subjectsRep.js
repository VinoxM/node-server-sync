import { SUBJECT_HIDE_VALUE, SUBSCRIBE_FIN_VALUE, SUBSCRIBE_GOON_VALUE, SUBSCRIBE_RESULT_HIDE_VALUE } from "../constants/subjectConstant.js";

const dbName = 'anime';

const FULL_COLUMNS = [
    'id',
    'bangumi_id',
    'name',
    'name_cn',
    'name_alias',
    'platform',
    'air_date',
    'season',
    'summary',
    'summary_cn',
    'total_episodes',
    'cover',
    'meta_tags',
    'staff',
    'characters',
    'hide',
    'update_time',
    'create_time',
]

const INSERT_COLUMNS_LENGTH = FULL_COLUMNS.length - 1; // Exclude 'id' column
const BATCH_INSERT_PARAMS_LIMIT = 500;

async function insertAny(subjects) {
    if (!subjects || subjects.length === 0) {
        return { rows: 0 }
    }
    const valueSql = `(${new Array(FULL_COLUMNS.length - 1).fill('?').join(',')})`;
    const sql = `INSERT OR IGNORE INTO subjects (${FULL_COLUMNS.slice(1).join(',')}) VALUES ${subjects.map(() => valueSql).join(',')}`;
    const values = subjects.flatMap(data => [
        data.bangumiId,
        data.name,
        data.nameCN,
        data.nameAlias,
        data.platform,
        data.airDate,
        data.season,
        data.summary,
        data.summaryCN,
        data.totalEpisodes,
        data.cover,
        data.metaTags,
        data.staff,
        data.characters,
        SUBJECT_HIDE_VALUE.NO,
        new Date(),
        new Date()
    ]);
    return __sqliteDB.insert(sql, values, null, dbName);
}

const UPDATE_COLUMNS_LENGTH = FULL_COLUMNS.length - 2; // Exclude 'id' and 'update_time' columns
const BATCH_UPDATE_PARAMS_LIMIT = 500;

async function updateAny(subjects) {
    if (!subjects || subjects.length === 0) {
        return { rows: 0 }
    }
    const sql = `UPDATE subjects SET ${FULL_COLUMNS.slice(2, FULL_COLUMNS.length - 1).map(c => `${c}=?`).join(",")} WHERE bangumi_id = ?`;
    const valuesArray = subjects.map(data => ({
        sql,
        params: [
            data.name,
            data.nameCN,
            data.nameAlias,
            data.platform,
            data.airDate,
            data.season,
            data.summary,
            data.summaryCN,
            data.totalEpisodes,
            data.cover,
            data.metaTags,
            data.staff,
            data.characters,
            data.hide ?? SUBJECT_HIDE_VALUE.NO,
            new Date(),
            data.bangumiId
        ]
    }));
    return __sqliteDB.updateBatch(valuesArray, null, dbName);
}

export default {
    insertOne: (subject) => insertAny([subject]),
    insertBatch: async (subjects) => {
        const fullBatchSize = Math.floor(BATCH_INSERT_PARAMS_LIMIT / INSERT_COLUMNS_LENGTH);
        if (subjects.length > fullBatchSize) {
            let totalInserted = 0;
            for (let i = 0; i < subjects.length; i += fullBatchSize) {
                const batch = subjects.slice(i, i + fullBatchSize)
                const { rows } = await insertAny(batch);
                totalInserted += rows;
            }
            return { rows: totalInserted };
        }
        return insertAny(subjects);
    },
    updateBatch: async (subjects) => {
        const fullBatchSize = Math.floor(BATCH_UPDATE_PARAMS_LIMIT / UPDATE_COLUMNS_LENGTH);
        if (subjects.length > fullBatchSize) {
            let totalUpdated = 0;
            let latestId = null;
            for (let i = 0; i < subjects.length; i += fullBatchSize) {
                const batch = subjects.slice(i, i + fullBatchSize)
                const { rows, lastId } = await updateAny(batch);
                totalUpdated += rows;
                latestId = lastId; // Update the latestId with the lastId from the current batch
            }
            return { rows: totalUpdated, lastId: latestId };
        }
        return updateAny(subjects);
    },
    selectNotExistsByBangumiIds: bangumiIds => {
        if (!bangumiIds || bangumiIds.length === 0) {
            return Promise.resolve([]);
        }
        const placeholders = bangumiIds.map(() => '?').join(',');
        const sql = `SELECT bangumi_id FROM subjects WHERE bangumi_id IN (${placeholders})`;
        return __sqliteDB.selectAll(sql, bangumiIds, null, dbName)
            .then(({ data: existingSubjects }) => {
                const existingBangumiIds = new Set(existingSubjects.map(subject => subject.bangumiId));
                return bangumiIds.filter(bangumiId => !existingBangumiIds.has(bangumiId));
            });
    },
    selectExistsByBangumiId: bangumiId => {
        return __sqliteDB.selectOne(`SELECT EXISTS(SELECT 1 FROM subjects WHERE bangumi_id = ? LIMIT 1) AS [exists]`, [bangumiId], null, dbName)
            .then(data => Boolean(data?.exists));
    },
    updateSubjectHide: (hide, id) => {
        return __sqliteDB.update(`UPDATE subjects SET hide=? WHERE id=?`, [hide, id], null, dbName);
    },
    selectVisibleBySeason: (season) => {
        const sql = `SELECT t.id, t.name, t.name_cn AS nameCN, t.name_alias, t.platform, t.air_date, t.season, t.total_episodes, t.cover, t.meta_tags, rs.fin, rs.start_time, `
            + 'CASE WHEN rs.goon = 0 OR t.season = ? THEN 0 ELSE 1 END AS goon, '
            + 'MAX(rr.pub_date) lastPub, MAX(rr.sort) latestSort, MAX(rr.episode) latestEp, COUNT(rr.id) count, '
            + `CASE WHEN julianday('now') - julianday(rr.pub_date) < 1 then 1 else 0 end hasNew `
            + 'FROM subjects t '
            + 'INNER JOIN rss_subscribe rs ON rs.bangumi_id=t.bangumi_id '
            + `LEFT JOIN rss_result rr ON rr.pid=rs.id AND rr.hide=${SUBSCRIBE_RESULT_HIDE_VALUE.NO} `
            + `WHERE (t.season=? AND t.hide=${SUBJECT_HIDE_VALUE.NO}) `
            + `OR (rs.fin=${SUBSCRIBE_FIN_VALUE.NO} AND rs.goon=${SUBSCRIBE_GOON_VALUE.YES} AND t.season<?) `
            + 'GROUP BY t.id ';
        const params = [season, season, season];
        return __sqliteDB.selectAll(sql, params, null, dbName);
    }
}