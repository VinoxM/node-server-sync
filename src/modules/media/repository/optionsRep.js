const dbName = 'media';
const enablePrint = { print: true };

/**
 * 媒体模块系统参数配置选项数据访问仓库
 */
export default {
    /**
     * 查询所有配置项列表
     * @returns {Promise<QueryResult<{ id: number, label: string, description: string, value: string, updateTime: string }>>}
     */
    selectAll: () => {
        const sql = `SELECT id,label, description,value,update_time FROM options`;
        return __sqliteDB.selectAll(sql, [], null, dbName);
    },

    /**
     * 根据主键 ID 更新配置项取值与描述
     * @param {number} id - 配置主键 ID
     * @param {string} value - 配置值
     * @param {string} description - 配置描述
     * @returns {Promise<ExecResult>}
     */
    updateById: (id, value, description) => {
        const sql = `UPDATE options SET value=?,description=?,update_time=? WHERE id=?`;
        return __sqliteDB.update(sql, [value, description, new Date(), id], null, dbName);
    },

    /**
     * 根据配置标签 (label) 更新配置项取值与描述
     * @param {string} label - 配置标签
     * @param {string} value - 配置值
     * @param {string} description - 配置描述
     * @returns {Promise<ExecResult>}
     */
    updateByLabel: (label, value, description) => {
        const sql = `UPDATE options SET value=?,description=?,update_time=? WHERE label=?`;
        return __sqliteDB.update(sql, [value, description, new Date(), label], null, dbName);
    },

    /**
     * 插入一条新的配置项（已存在同名 label 则忽略）
     * @param {string} label - 配置标签
     * @param {string} description - 描述
     * @param {string} value - 配置值
     * @returns {Promise<ExecResult>}
     */
    insertOne: (label, description, value) => {
        const sql = `INSERT OR IGNORE INTO options(label, description, value, update_time) VALUES(?,?,?,?)`;
        return __sqliteDB.insert(sql, [label, description, value, new Date()], null, dbName);
    },

    /**
     * 根据配置标签 (label) 查询单条配置
     * @param {string} label - 配置标签
     * @returns {Promise<{ id: number, label: string, description: string, value: string, updateTime: string }|null>}
     */
    selectByLabel: (label) => {
        const sql = `SELECT id,label,description,value,update_time FROM options WHERE label=?`;
        return __sqliteDB.selectOne(sql, [label], null, dbName);
    },

    /**
     * 根据主键 ID 查询单条配置
     * @param {number} id - 配置 ID
     * @returns {Promise<{ id: number, label: string, description: string, value: string, updateTime: string }|null>}
     */
    selectById: (id) => {
        const sql = `SELECT id,label,description,value,update_time FROM options WHERE id=?`;
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    }
};