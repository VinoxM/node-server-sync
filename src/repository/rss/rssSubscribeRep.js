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
        if (isNotBlank(data[key])) {
            callback(key, k)
        }
    }
}

const dbName = 'rss'
const enablePrint = { print: true }

export default {
    selectForSubscribeByIds: (ids) => {
        if (isEmptyArray(ids)) {
            return Promise.resolve([]);
        }
        const sql = "SELECT id,regex,url " +
            "FROM rss_subscribe " +
            `WHERE id IN (${ids.map(_ => "?").join(',')})`;
        return sqliteDB.selectAll(sql, ids, null, dbName);
    },
    insertOne: (rss, transactionDB) => {
        const sql = "INSERT OR IGNORE INTO " +
            "rss_subscribe(name, name_jp, url, regex, season, start_time, cover, fin, is_short, anime_type, goon, staff, [cast], origin_type, type_tag, broadcast) " +
            "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)";
        const params = [
            rss.name, isBlankOr(rss.nameJP, ""), isBlankOr(rss.url, ""), isBlankOr(rss.regex, ""), rss.season,
            isBlankOr(rss.startTime, ""), isBlankOr(rss.cover, ""), isBlankOr(rss.fin, "N"), rss.isShort, rss.animeType,
            rss.goon, isBlankOr(rss.staff, ""), isBlankOr(rss.cast, ""), isBlankOr(rss.originType, ""), isBlankOr(rss.typeTag, ""), isBlankOr(rss.broadcast, "")
        ]
        return (transactionDB || sqliteDB).insert(sql, params, enablePrint, dbName);
    },
    updateFinById: (id, fin) => {
        const sql = `UPDATE rss_subscribe SET fin=?${fin === 'Y' ? ',goon=0' : ''} WHERE id=?`;
        return sqliteDB.update(sql, [fin, id], enablePrint, dbName);
    },
    deleteById: (id, transactionDB) => {
        const sql = `DELETE FROM rss_subscribe WHERE id = ?`;
        return (transactionDB || sqliteDB).delete(sql, [id], enablePrint, dbName);
    },
    deleteByIds: (ids, transactionDB) => {
        if (isEmptyArray(ids)) return Promise.resolve({ rows: 0 });
        const sql = `DELETE FROM rss_subscribe WHERE id IN (${ids.map(_ => "?").join(",")})`;
        return (transactionDB || sqliteDB).delete(sql, ids, enablePrint, dbName);
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
        return (transactionDB || sqliteDB).update(sql, params, enablePrint, dbName);
    },
    selectForReplaceBySeasons: (seasons) => {
        if (isEmptyArray(seasons)) {
            return Promise.resolve([]);
        }
        const sql = "SELECT id,name,name_jp nameJP,regex,url,season,start_time startTime,cover,fin,is_short isShort,anime_type animeType,goon,staff,[cast],origin_type originType, type_tag typeTag, broadcast " +
            "FROM rss_subscribe " +
            `WHERE season IN (${seasons.map(_ => "?").join(",")})`;
        return sqliteDB.selectAll(sql, seasons, enablePrint, dbName);
    },
    updateOneWithParamsById: (id, params, transactionDB) => {
        if (isBlank(id)) return Promise.resolve({ rows: 0 });
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
        return (transactionDB || sqliteDB).update(sql, parameters, enablePrint, dbName);
    }
}