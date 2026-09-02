const dbName = 'media';
const enablePrint = { print: true };

/**
 * 媒体视频标签 (Tags) 数据访问仓库
 */
export default {
    /**
     * 根据标签名称查询单条标签
     * @param {string} tag - 标签文本
     * @returns {Promise<{ id: number, name: string }|null>}
     */
    selectOneByName: tag => {
        const sql = 'SELECT id, name FROM tags WHERE name=?';
        return __sqliteDB.selectOne(sql, [tag], null, dbName);
    },

    /**
     * 插入一个新标签
     * @param {string} tag - 标签文本
     * @returns {Promise<ExecResult>}
     */
    insertOne: tag => {
        const sql = 'INSERT INTO tags(name) VALUES(?)';
        return __sqliteDB.insert(sql, [tag], null, dbName);
    }
};