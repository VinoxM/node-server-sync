import { embedTransformer } from "../../../core/infra/transformer.js";

const callbackIfKeyAbsent = (callback, data) => {
    const insertPropertyMap = {
        'season': 'season',
        'name': 'name',
        'name_jp': 'nameJP',
        'cover': 'cover',
        'start_time': 'startTime',
        'fin': 'fin',
        'is_short': 'isShort',
        'anime_type': 'animeType',
        'staff': 'staff',
        '[cast]': 'cast',
        'origin_type': 'originType',
        'broadcast': 'broadcast',
        'type_tag': 'typeTag',
        'goon': 'goon'
    }
    for (const k in insertPropertyMap) {
        const key = insertPropertyMap[k];
        if (__isNotBlank(data[key])) {
            callback(key, k)
        }
    }
}

const dbName = 'rss'
const enablePrint = { print: true }

export default {
    selectForSubscribeByIds: (ids) => {
        if (__isEmptyArray(ids)) {
            return Promise.resolve([]);
        }
        const sql = "SELECT id,regex,url " +
            "FROM rss_subscribe " +
            `WHERE id IN (${ids.map(_ => "?").join(',')})`;
        return __sqliteDB.selectAll(sql, ids, null, dbName);
    },
    insertOne: (rss, transactionDB) => {
        const sql = "INSERT OR IGNORE INTO " +
            "rss_subscribe(name, name_jp, url, regex, season, start_time, cover, fin, is_short, anime_type, goon, staff, [cast], origin_type, type_tag, broadcast) " +
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        const params = [
            rss.name, __isBlankOr(rss.nameJP, ""), __isBlankOr(rss.url, ""), __isBlankOr(rss.regex, ""), rss.season,
            __isBlankOr(rss.startTime, ""), __isBlankOr(rss.cover, ""), __isBlankOr(rss.fin, "N"), rss.isShort, rss.animeType,
            rss.goon, __isBlankOr(rss.staff, ""), __isBlankOr(rss.cast, ""), __isBlankOr(rss.originType, ""), __isBlankOr(rss.typeTag, ""), __isBlankOr(rss.broadcast, "")
        ]
        return (transactionDB || __sqliteDB).insert(sql, params, enablePrint, dbName);
    },
    updateFinById: (id, fin) => {
        const sql = `UPDATE rss_subscribe SET fin=?${fin === 'Y' ? ',goon=0' : ''} WHERE id=?`;
        return __sqliteDB.update(sql, [fin, id], enablePrint, dbName);
    },
    deleteById: (id, transactionDB) => {
        const sql = `DELETE FROM rss_subscribe WHERE id = ?`;
        return (transactionDB || __sqliteDB).delete(sql, [id], enablePrint, dbName);
    },
    deleteByIds: (ids, transactionDB) => {
        if (__isEmptyArray(ids)) return Promise.resolve({ rows: 0 });
        const sql = `DELETE FROM rss_subscribe WHERE id IN (${ids.map(_ => "?").join(",")})`;
        return (transactionDB || __sqliteDB).delete(sql, ids, enablePrint, dbName);
    },
    updateOneById: (rss, transactionDB) => {
        let sql = "UPDATE rss_subscribe SET url=?,regex=?";
        const params = [rss.url, rss.regex];
        callbackIfKeyAbsent((key, property) => {
            sql += `,${property}=?`;
            params.push(rss[key]);
        }, rss);
        sql += " WHERE id=?";
        params.push(rss.id);
        return (transactionDB || __sqliteDB).update(sql, params, enablePrint, dbName);
    },
    selectForReplaceBySeasons: (seasons) => {
        if (__isEmptyArray(seasons)) {
            return Promise.resolve([]);
        }
        const sql = "SELECT id,name,name_jp nameJP,regex,url,season,start_time startTime,cover,fin,is_short isShort,anime_type animeType,goon,staff,[cast],origin_type originType, type_tag typeTag, broadcast " +
            "FROM rss_subscribe " +
            `WHERE season IN (${seasons.map(_ => "?").join(",")})`;
        return __sqliteDB.selectAll(sql, seasons, enablePrint, dbName);
    },
    updateOneWithParamsById: (id, params, transactionDB) => {
        if (__isBlank(id)) return Promise.resolve({ rows: 0 });
        let sql = "UPDATE rss_subscribe SET ";
        const parameters = [];
        callbackIfKeyAbsent((key, property) => {
            sql += `${property}=?,`;
            parameters.push(params[key]);
        }, params);
        if (parameters.length === 0) return Promise.resolve({ rows: 1 });
        sql = sql.substring(0, sql.length - 1);
        sql += " WHERE id=?";
        parameters.push(id);
        return (transactionDB || __sqliteDB).update(sql, parameters, enablePrint, dbName);
    },
    selectEpisodesExistsSubsForSearch: (season, title, pageSize, pageNum) => {
        const params = []
        const whereCondition = []
        if (__isNotBlank(season)) {
            whereCondition.push(`rs.season = ?`)
            params.push(season)
        }
        if (__isNotBlank(title)) {
            whereCondition.push(`rs.name LIKE ?`)
            params.push(`%${title}%`)
        }
        const whereClause = whereCondition.length > 0 ? `WHERE ${whereCondition.join(' AND ')}` : '';
        let limitOffset = '';
        if (pageNum !== undefined && pageSize !== undefined) {
            const offset = (pageNum - 1) * pageSize;
            limitOffset = ` LIMIT ${pageSize} OFFSET ${offset}`;
        }
        const sql = `SELECT `
            + `rs.id, rs.name, rs.name_jp, rs.cover, rs.start_time, rs.season, rs.fin, rs.is_short, `
            + `COUNT(DISTINCT t.id) as taskCount, `
            + `COUNT(DISTINCT e.id) as episodeCount, `
            + `COUNT(DISTINCT ef.id) as episodeFailedCount, `
            + `COUNT(DISTINCT es.id) as subtitleCount `
            + `FROM rss_subscribe rs `
            + `LEFT JOIN rss_torrent_task t ON rs.id = t.rss_subs_id `
            + `LEFT JOIN rss_episode e ON rs.id = e.rss_subs_id `
            + `LEFT JOIN rss_episode_failed ef ON rs.id = ef.rss_subs_id `
            + `LEFT JOIN rss_episode_subtitle es ON rs.id = es.rss_subs_id `
            + `${whereClause} `
            + `GROUP BY rs.id `
            + `HAVING (taskCount + episodeCount + episodeFailedCount + subtitleCount) > 0 `
            + `ORDER BY rs.season DESC `
            + `${limitOffset}`
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },
    selectEpisodesExistsSubsForCount: (season, title) => {
        const params = []
        const whereCondition = []
        if (__isNotBlank(season)) {
            whereCondition.push(`rs.season = ?`)
            params.push(season)
        }
        if (__isNotBlank(title)) {
            whereCondition.push(`rs.name LIKE ?`)
            params.push(`%${title}%`)
        }
        const whereClause = whereCondition.length > 0 ? `WHERE ${whereCondition.join(' AND ')}` : '';
        const sql = `SELECT COUNT(*) as total FROM (`
            + `SELECT rs.id `
            + `FROM rss_subscribe rs `
            + `LEFT JOIN rss_torrent_task t ON rs.id = t.rss_subs_id `
            + `LEFT JOIN rss_episode e ON rs.id = e.rss_subs_id `
            + `LEFT JOIN rss_episode_failed ef ON rs.id = ef.rss_subs_id `
            + `LEFT JOIN rss_episode_subtitle es ON rs.id = es.rss_subs_id `
            + `${whereClause} `
            + `GROUP BY rs.id `
            + `HAVING (COUNT(DISTINCT t.id) + COUNT(DISTINCT e.id) + COUNT(DISTINCT ef.id) + COUNT(DISTINCT es.id)) > 0)`
        return __sqliteDB.selectOne(sql, params, null, dbName).then(res => res?.total || 0)
    },
    selectEpisodesExistsSubsBySubsId: subsId => {
        const sql = `SELECT COUNT(*) as total FROM (`
            + `SELECT rs.id `
            + `FROM rss_subscribe rs `
            + `LEFT JOIN rss_torrent_task t ON rs.id = t.rss_subs_id `
            + `LEFT JOIN rss_episode e ON rs.id = e.rss_subs_id `
            + `LEFT JOIN rss_episode_failed ef ON rs.id = ef.rss_subs_id `
            + `LEFT JOIN rss_episode_subtitle es ON rs.id = es.rss_subs_id `
            + `WHERE rs.id=? `
            + `GROUP BY rs.id `
            + `HAVING (COUNT(DISTINCT t.id) + COUNT(DISTINCT e.id) + COUNT(DISTINCT ef.id) + COUNT(DISTINCT es.id)) > 0)`
        return __sqliteDB.selectOne(sql, [subsId], null, dbName).then(res => res?.total || 0)
    },
    selectEmptyNameVector: (limited = 500) => {
        return __sqliteDB.selectAll(`SELECT id FROM rss_subscribe WHERE name_vector IS NULL LIMIT ${limited}`, [], null, dbName)
    },
    updateNameVectorById: async (id, transactionDB) => {
        const db = transactionDB || __sqliteDB
        const sub = await db.selectOne(`SELECT id, name FROM rss_subscribe WHERE id=?`, [id], null, dbName)
        if (!sub) return { rows: 0 }
        const embedValue = await embedTransformer.extract(sub.name)
        const embedStr = JSON.stringify(embedValue)
        await db.update(`UPDATE rss_subscribe SET name_vector = vector8(?) WHERE id=?`, [embedStr, id], null, dbName)
    },
    selectByNameVector: (name, season) => {
        const options = {
            tableName: 'rss_subscribe',
            embedColumn: 'name_vector',
            embedStr: name,
            selectColumns: ['id'],
            similarity: 0.6,
            extraWhere: __isNotBlank(season) ? 'season=?' : '',
            whereParams: [season]
        }
        return __sqliteDB.vectorSearch(options, dbName).then(res => res.data);
    }
}