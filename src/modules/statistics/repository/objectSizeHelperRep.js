/**
 * 对象存储文件大小通用查询与回填 Repository
 * 提供对各业务表中 MinIO 资源链接及文件大小字段的分页游标遍历与批量更新能力
 */
export default {
    /**
     * 分页查询尚未回填大小的对象记录 (size IS NULL)
     * @param {string} dbName - 数据库名
     * @param {string} tableName - 表名
     * @param {string} linkColumn - 存储路径/URL 字段名
     * @param {string} sizeColumn - 文件大小字段名
     * @param {string[]} [matchers] - 额外的 SQL 过滤条件数组 (如 `['is_deleted = 0']`)
     * @param {number} lastId - 上一页最大 ID 游标
     * @param {number} limit - 每页查询条数
     * @returns {Promise<QueryResult<{ id: number, link: string }>>}
     */
    selectUnprocessed: (dbName, tableName, linkColumn, sizeColumn, matchers, lastId, limit) => {
        let sql = `SELECT id, ${linkColumn} AS link FROM ${tableName} WHERE `;
        const concat = [`id > ?`, `${sizeColumn} IS NULL`];
        if (__isNotEmptyArray(matchers)) {
            concat.push(...matchers);
        }
        sql += concat.join(' AND ');
        sql += ` ORDER BY id LIMIT ? `;
        return __sqliteDB.selectAll(sql, [lastId, limit], null, dbName);
    },

    /**
     * 分页查询已完成大小计算的对象记录 (size IS NOT NULL)
     * @param {string} dbName - 数据库名
     * @param {string} tableName - 表名
     * @param {string} linkColumn - 存储路径/URL 字段名
     * @param {string} sizeColumn - 文件大小字段名
     * @param {string[]} [matchers] - 额外的 SQL 过滤条件数组
     * @param {number} lastId - 上一页最大 ID 游标
     * @param {number} limit - 每页查询条数
     * @returns {Promise<QueryResult<{ id: number, link: string, size: number|string }>>}
     */
    selectProcessed: (dbName, tableName, linkColumn, sizeColumn, matchers, lastId, limit) => {
        let sql = `SELECT id, ${linkColumn} AS link, ${sizeColumn} AS size FROM ${tableName} WHERE `;
        const concat = [`id > ?`, `${sizeColumn} IS NOT NULL `];
        if (__isNotEmptyArray(matchers)) {
            concat.push(...matchers);
        }
        sql += concat.join(' AND ');
        sql += ` ORDER BY id LIMIT ? `;
        return __sqliteDB.selectAll(sql, [lastId, limit], null, dbName);
    },

    /**
     * 根据主键 ID 更新指定记录的文件大小
     * @param {string} dbName - 数据库名
     * @param {string} tableName - 表名
     * @param {string} sizeColumn - 文件大小字段名
     * @param {number|string} size - 文件字节数
     * @param {number} id - 主键 ID
     * @returns {Promise<ExecResult>}
     */
    updateObjectSizeById: (dbName, tableName, sizeColumn, size, id) => {
        const sql = `UPDATE ${tableName} SET ${sizeColumn}=? WHERE id=?`;
        return __sqliteDB.update(sql, [size, id], null, dbName);
    }
};
