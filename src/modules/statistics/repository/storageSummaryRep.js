const dbName = 'statistics';

/**
 * 存储容量汇总统计快照 Repository
 */
export default {
    /**
     * 插入一条全库存储容量快照记录
     * @param {number} totalCount - 统计包含的对象总个数
     * @param {string} totalSize - 统计总字节数字符串 (支持超大整数)
     * @param {Record<string, any>} dimensions - 维度统计指标明细 (如按 bucket 汇总)
     * @returns {Promise<ExecResult>}
     */
    insertOne: (totalCount, totalSize, dimensions) => {
        const sql = `INSERT INTO storage_summary(total_count, total_size, dimensions, summary_at) VALUES(?,?,?,?)`;
        return __sqliteDB.insert(sql, [totalCount, totalSize, JSON.stringify(dimensions), new Date()], null, dbName);
    },

    /**
     * 查询最新生成的一条存储容量快照
     * （SqliteDB.selectOne 直接返回单个实体对象或 null，且字段名自动转为小驼峰）
     * @returns {Promise<{ id: number, totalCount: number, totalSize: string, dimensions: string, summaryAt: string }|null>}
     */
    selectLatest: () => {
        const sql = `SELECT id, total_count, total_size, dimensions, summary_at FROM storage_summary ORDER BY id DESC LIMIT 1`;
        return __sqliteDB.selectOne(sql, [], null, dbName);
    },

    /**
     * 删除超出保留期的历史统计快照数据
     * @param {number} expire - 过期毫秒数
     * @returns {Promise<ExecResult>}
     */
    deleteExpiredData: (expire) => {
        const expiredTimestamp = Date.now() - expire;
        const sql = `DELETE FROM storage_summary WHERE summary_at < ?`;
        return __sqliteDB.delete(sql, [expiredTimestamp], null, dbName);
    }
};