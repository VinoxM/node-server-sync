const dbName = 'anime';
const enablePrint = { print: true };

/**
 * RSS 过滤正则表达式使用历史与热度排行榜仓储服务
 */
export default {
    /**
     * 插入一条新的正则表达式使用记录
     * @param {string} regex - 正则表达式
     * @param {number} score - 综合热度与时间戳分数
     * @returns {Promise<ExecResult>}
     */
    insertRegex: (regex, score) => {
        const sql = "INSERT INTO rss_regex_history(regex, score) VALUES(?, ?)";
        return __sqliteDB.insert(sql, [regex, score], enablePrint, dbName);
    },

    /**
     * 更新已存在正则表达式的权重分数
     * @param {string} regex - 正则表达式
     * @param {number} score - 新分数
     * @returns {Promise<ExecResult>}
     */
    updateRegex: (regex, score) => {
        const sql = "UPDATE rss_regex_history SET score = ? WHERE regex = ?";
        return __sqliteDB.update(sql, [score, regex], enablePrint, dbName);
    },

    /**
     * 查询指定正则表达式当前记录的权重分数
     * @param {string} regex - 正则表达式
     * @returns {Promise<number|null>}
     */
    selectScoreByRegex: async (regex) => {
        const sql = "SELECT score FROM rss_regex_history WHERE regex = ?";
        return __sqliteDB.selectOne(sql, [regex], enablePrint, dbName).then(data => data?.score || null);
    },

    /**
     * 按使用权重热度倒序查询 Top N 的正则表达式列表
     * @param {number} limit - 查询条数
     * @returns {Promise<QueryResult<{ id: number, regex: string, score: number }>>}
     */
    selectByRank: (limit) => {
        const sql = "SELECT rrh.id id,rrh.regex regex,rrh.score score FROM rss_regex_history rrh " +
            "INNER JOIN (SELECT id, score FROM rss_regex_history ORDER BY score DESC LIMIT ?) t ON rrh.id=t.id";
        return __sqliteDB.selectAll(sql, [limit], enablePrint, dbName);
    }
};