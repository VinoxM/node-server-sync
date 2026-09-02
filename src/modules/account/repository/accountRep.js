const dbName = 'account';

const enablePrint = { print: true };

/**
 * 用户账户数据访问仓库
 */
export default {
    /**
     * 判断指定用户名的用户是否存在
     * @param {string} uname - 用户名
     * @returns {Promise<boolean>} 用户存在返回 true，否则返回 false
     */
    userExists: async (uname) => {
        const sql = `SELECT COUNT(uname) AS count FROM auth_user WHERE uname = ?`;
        return __sqliteDB.selectOne(sql, [uname], null, dbName).then(res => res.count === 1);
    },

    /**
     * 根据用户名查询用户信息（包含加密密码）
     * @param {string} uname - 用户名
     * @returns {Promise<{ id: number, uname: string, password: string }|null>} 用户记录，不存在时返回 null
     */
    selectByUname: (uname) => {
        const sql = `SELECT id, uname, password FROM auth_user WHERE uname = ?`;
        return __sqliteDB.selectOne(sql, [uname], null, dbName);
    },

    /**
     * 根据用户名与密码查询用户基础信息（用于登录验证）
     * @param {string} uname - 用户名
     * @param {string} password - 加密后的密码密文
     * @returns {Promise<{ id: number, uname: string }|null>} 用户记录，匹配失败时返回 null
     */
    selectByUnameAndPassword: (uname, password) => {
        const sql = `SELECT id, uname FROM auth_user WHERE uname = ? AND password = ?`;
        return __sqliteDB.selectOne(sql, [uname, password], null, dbName);
    },

    /**
     * 插入一条新用户记录（若用户名已存在则跳过）
     * @param {string} uname - 用户名
     * @param {string} password - 加密后的密码密文
     * @returns {Promise<number>} 插入影响的行数 (1 表示成功，0 表示用户名已存在或参数为空)
     */
    insertOne: async (uname, password) => {
        if (__isAnyBlank(uname, password)) {
            return Promise.resolve(0);
        }
        const sql = 'INSERT INTO auth_user (uname, password, update_time, create_time) SELECT ?,?,?,? WHERE NOT EXISTS (' +
            'SELECT 1 FROM auth_user WHERE uname = ?)';
        const createTime = new Date();
        const params = [uname, password, createTime, createTime, uname];
        return __sqliteDB.insert(sql, params, null, dbName).then(res => res.rows);
    },

    /**
     * 根据用户名更新用户密码及更新时间
     * @param {string} uname - 用户名
     * @param {string} password - 新的加密密码密文
     * @returns {Promise<number>} 更新影响的行数 (1 表示更新成功，0 表示未变更或参数为空)
     */
    updatePasswordByUname: async (uname, password) => {
        if (__isAnyBlank(uname, password)) {
            return Promise.resolve(0);
        }
        const sql = 'UPDATE auth_user SET password = ?, update_time = ? WHERE uname = ?';
        const params = [password, new Date(), uname];
        return __sqliteDB.update(sql, params, enablePrint, dbName).then(res => res.rows);
    }
};