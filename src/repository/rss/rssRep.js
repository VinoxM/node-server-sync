import resultMap from '../../entity/resultMap.js';
import { isCurSeason } from '../../common/dateUtil.js';

const { rssSubscribe, rssResult } = resultMap

const dbName = 'rss'
const enablePrint = { print: true }

export default {
    selectRssSubscribeBySeasonAndSearch: (season, search) => {
        let sql = "SELECT rs.id,rs.name,rs.name_jp nameJP,rs.regex,rs.url,rs.season,rs.start_time " +
            "startTime,rs.cover,rs.fin,rs.is_short isShort,rs.anime_type animeType, MAX(rr.sort) latestSort, rr.episode latestEp, COUNT(rr.id) count,true lazy,goon,staff,[cast],origin_type originType,type_tag typeTag,broadcast " +
            "FROM rss_subscribe rs " +
            "LEFT JOIN rss_result rr ON rs.id=rr.pid AND rr.hide=0 " +
            "WHERE";
        const params = [];
        const sqlArr = [];
        if (season) {
            sqlArr.push(" rs.season=? ");
            params.push(season);
        }
        if (search) {
            sqlArr.push(' rs.name LIKE ? ');
            params.push(`%${search}%`);
        }
        sql += sqlArr.join("AND") + "GROUP BY rs.id";
        return sqliteDB.selectAll(sql, params, { ...enablePrint, resultMap: rssSubscribe }, dbName);
    },
    selectRssSubscribeForSearchV2: (season, search) => {
        const params = [];
        const sqlArr = [];
        let sql = "SELECT rs.id,rs.name,rs.name_jp nameJP,rs.season,rs.start_time startTime," +
            "rs.cover,rs.fin,rs.is_short isShort,rs.anime_type animeType, " +
            "CASE WHEN rs.goon = 0 THEN 0 ";
        if (season) {
            sql += "WHEN rs.season = ? THEN 0 ";
            params.push(season);
        }
        sql += "ELSE 1 END AS goon, MAX(rr.pub_date) lastPub, MAX(rr.sort) latestSort, MAX(rr.episode) latestEp, COUNT(rr.id) count " +
            ",CASE WHEN julianday('now') - julianday(rr.pub_date) < 1 then 1 else 0 end hasNew " +
            "FROM rss_subscribe rs " +
            "LEFT JOIN rss_result rr ON rs.id=rr.pid AND rr.hide=0 " +
            "WHERE";
        if (season) {
            sqlArr.push(" rs.season=? ");
            params.push(season);
        }
        if (search) {
            sqlArr.push(' rs.name LIKE ? ');
            params.push(`%${search}%`);
            sql += sqlArr.join("AND");
        } else if (isCurSeason(season)) {
            sqlArr.push(` (rs.fin='N' AND rs.goon=1 AND rs.season<?) `);
            params.push(season);
            sql += sqlArr.join("OR");
        } else {
            sql += sqlArr.join('AND');
        }
        sql += "GROUP BY rs.id";
        return sqliteDB.selectAll(sql, params, { resultMap: rssSubscribe }, dbName);

    },
    selectRssSubscribeSeasons: () => {
        const sql = "SELECT season FROM rss_subscribe GROUP BY season";
        return sqliteDB.selectAll(sql, [], enablePrint, dbName);
    },
    selectRssSubscribeSeasonsV2: () => {
        const sql = "SELECT season, count(1) `count` FROM rss_subscribe GROUP BY season";
        return sqliteDB.selectAll(sql, [], null, dbName);
    },
    selectRssResultsByPid: (pid, withOutHide) => {
        const sql = "SELECT id,pid,title,torrent,pub_date,hide,tracker,episode,up_date,sort FROM rss_result WHERE pid=? " +
            `${withOutHide ? 'AND hide=0 ' : ''}` +
            "ORDER BY sort DESC";
        return sqliteDB.selectAll(sql, [pid], { ...enablePrint, resultMap: rssResult }, dbName);
    },
    selectRssResultsByPidV2: (pid) => {
        const sql = "SELECT title,torrent,pub_date,tracker,episode FROM rss_result WHERE pid=? AND hide=0 ORDER BY sort DESC";
        return sqliteDB.selectAll(sql, [pid], { resultMap: rssResult }, dbName);
    },
    selectRssResultsByPidForEdit: (pid) => {
        const sql = "SELECT id, pid, title,torrent,pub_date,hide,tracker,episode,up_date,sort FROM rss_result WHERE pid=? ORDER BY sort DESC";
        return sqliteDB.selectAll(sql, [pid], { resultMap: rssResult }, dbName);
    },
    selectRssSubscribeCauseGoon: (season) => {
        const sql = "SELECT rs.id,rs.name,rs.name_jp nameJP,rs.regex,rs.url,rs.season,rs.start_time " +
            "startTime,rs.cover,rs.fin,rs.is_short isShort,rs.anime_type animeType, MAX(rr.pub_date) lastPub, " +
            "COUNT(rr.id) count,true lazy,goon,staff,[cast],origin_type originType, type_tag typeTag, broadcast " +
            "FROM rss_subscribe rs " +
            "LEFT JOIN  rss_result rr ON rs.id=rr.pid AND rr.hide=0 " +
            "WHERE rs.fin='N' AND rs.goon=1 AND rs.season<? " +
            "GROUP BY rs.id";
        return sqliteDB.selectAll(sql, [season], { ...enablePrint, resultMap: rssSubscribe }, dbName);
    },
    selectRssSubscribeWithoutFin: () => {
        const sql = "SELECT id,name,regex,url,season FROM rss_subscribe WHERE fin='N' ORDER BY season";
        return sqliteDB.selectAll(sql, [], null, dbName);
    },
    selectRssSubscribeCountsWithoutFin: () => {
        const sql = "SELECT rs.id,rs.name,count(rr.id) counts FROM rss_subscribe rs LEFT JOIN rss_result rr ON rs.id = rr.pid WHERE rs.fin='N' GROUP BY rs.id,rs.name";
        return sqliteDB.selectAll(sql, [], null, dbName);
    },
    selectRssSubscribeByIdWithLimited: (id, limited) => {
        let sql = "SELECT rs.id,rs.name,rs.cover,rr.id rid, rr.title, rr.tracker,rr.torrent FROM rss_subscribe rs LEFT JOIN rss_result rr ON rs.id = rr.pid WHERE rs.fin='N' AND rs.id ="
        sql += id + " ORDER BY rr.id DESC LIMIT " + limited
        return sqliteDB.selectAll(sql, [], null, dbName);
    },
    selectOneById: (id) => {
        const sql = "SELECT name, name_jp, cover,fin,is_short,staff,[cast],origin_type originType,type_tag typeTag,broadcast FROM rss_subscribe WHERE id = ?";
        return sqliteDB.selectOne(sql, [id], { resultMap: rssSubscribe }, dbName);
    },
    selectOneForEdit: (id) => {
        const sql = "SELECT id,name, name_jp, url, regex,season,start_time, cover,fin,is_short,anime_type animeType, goon,staff,[cast],origin_type originType,type_tag typeTag,broadcast FROM rss_subscribe WHERE id = ?";
        return sqliteDB.selectOne(sql, [id], { resultMap: rssSubscribe }, dbName);
    }
}