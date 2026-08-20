const dbName = 'anime';

const FULL_COLUMNS = [
    'id',
    'bangumi_id',
    'name',
    'name_cn',
    'name_alias',
    'platform',
    'air_date',
    'summary',
    'summary_cn',
    'total_episodes',
    'cover',
    'meta_tags',
    'staff',
    'characters',
    'create_time',
    'update_time',
]

export default {
    insertOne: (data) => {
        const sql = `INSERT OR IGNORE INTO subjects (${FULL_COLUMNS.slice(1).join(',')}) VALUES (${FULL_COLUMNS.slice(1).map(() => '?').join(',')})`
        return __sqliteDB.insert(sql, [
            data.bangumiId,
            data.name,
            data.nameCN,
            data.nameAlias,
            data.platform,
            data.airDate,
            data.summary,
            data.summaryCN,
            data.totalEpisodes,
            data.cover,
            data.metaTags,
            data.staff,
            data.characters,
            new Date(),
            new Date()
        ], null, dbName);
    },
    selectExistsByBangumiId: bangumiId => {
        return __sqliteDB.selectOne(`SELECT EXISTS(SELECT 1 FROM subjects WHERE bangumi_id = ? LIMIT 1) AS [exists]`, [bangumiId], null, dbName)
            .then(data => Boolean(data?.exists))
    }
}