const dbName = 'kuro';

const enablePrint = { print: true };

/**
 * 库洛游戏 (Kuro Game) 社区与签到数据访问仓库
 */
export default {
    /**
     * 根据用户 ID 查询已存储的库洛社区 Token
     * @param {string|number} uid - 库洛用户 ID
     * @returns {Promise<string|undefined>} 对应的 Token 字符串
     */
    selectTokenByUid: async (uid) => {
        const sql = 'SELECT token FROM kuro_community_account WHERE uid=?';
        return __sqliteDB.selectOne(sql, [uid], null, dbName).then(obj => obj?.token);
    },

    /**
     * 插入或更新库洛社区账户与 Token 凭据
     * @param {Object} account - 账户数据
     * @param {string|number} account.uid - 库洛用户 ID
     * @param {string} account.token - 库洛用户 Token
     * @returns {Promise<ExecResult>}
     */
    insertOrUpdateAccount: ({ uid, token }) => {
        const sql = 'REPLACE INTO kuro_community_account(uid, token) VALUES(?,?)';
        return __sqliteDB.insert(sql, [uid, token], enablePrint, dbName);
    },

    /**
     * 根据用户 ID 删除库洛社区账户与凭据
     * @param {string|number} uid - 库洛用户 ID
     * @returns {Promise<ExecResult>}
     */
    deleteAccountByUid: (uid) => {
        const sql = 'DELETE FROM kuro_community_account WHERE uid=?';
        return __sqliteDB.delete(sql, [uid], enablePrint, dbName);
    },

    /**
     * 查询用户配置的自动签到游戏 ID 列表（逗号分隔，如 '3,2'）
     * @param {string|number} uid - 库洛用户 ID
     * @returns {Promise<string|undefined>} 游戏 ID 列表字符串
     */
    selectSignGamesByUid: async (uid) => {
        const sql = 'SELECT game_ids gameIds FROM kuro_game_sign WHERE uid=?';
        return __sqliteDB.selectOne(sql, [uid], null, dbName).then(obj => obj?.gameIds);
    },

    /**
     * 插入或更新用户配置的自动签到游戏 ID 列表
     * @param {Object} signConfig - 签到配置
     * @param {string|number} signConfig.uid - 库洛用户 ID
     * @param {string} signConfig.games - 游戏 ID 列表字符串
     * @returns {Promise<ExecResult>}
     */
    insertOrUpdateSignGames: ({ uid, games }) => {
        const sql = 'REPLACE INTO kuro_game_sign(uid, game_ids) VALUES(?, ?)';
        return __sqliteDB.insert(sql, [uid, games], enablePrint, dbName);
    },

    /**
     * 关联查询所有已绑定并配置了签到的用户、Token 及游戏 ID 列表
     * @returns {Promise<QueryResult<{ uid: string|number, token: string, gameIds: string }>>}
     */
    selectAllSignAccount: () => {
        const sql = 'SELECT ac.uid,ac.token,si.game_ids gameIds ' +
            'FROM kuro_community_account ac ' +
            'LEFT JOIN kuro_game_sign si ON ac.uid=si.uid';
        return __sqliteDB.selectAll(sql, [], null, dbName);
    }
};