const dbName = 'rss'
const enablePrint = { print: true }

export default {
    insertRegex: (regex, score) => {
        const sql = "INSERT INTO rss_regex_history(regex, score) VALUES(?, ?)";
        return sqliteDB.insert(sql, [regex, score], enablePrint, dbName);
    },
    updateRegex: (regex, score) => {
        const sql = "UPDATE rss_regex_history SET score = ? WHERE regex = ?";
        return sqliteDB.update(sql, [score, regex], enablePrint, dbName);
    },
    selectScoreByRegex: (regex) => {
        const sql = "SELECT score FROM rss_regex_history WHERE regex = ?";
        return sqliteDB.selectOne(sql, [regex], enablePrint, dbName).then(data => data?.score || null);
    },
    selectByRank: (limit) => {
        const sql = "SELECT rrh.id id,rrh.regex regex,rrh.score score FROM rss_regex_history rrh " +
            "INNER JOIN (SELECT id, score FROM rss_regex_history ORDER BY score DESC LIMIT ?) t ON rrh.id=t.id";
        return sqliteDB.selectAll(sql, [limit], enablePrint, dbName);
    }
}