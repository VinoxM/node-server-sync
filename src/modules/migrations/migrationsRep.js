/** @type {string} 迁移记录所存储的数据库名称 */
export const dbName = 'execution';

const enablePrint = { print: true };

/**
 * 数据库 SQL 迁移版本记录数据访问仓库
 */
export default {
    /**
     * 插入一条 SQL 脚本迁移执行记录
     * @param {string} fileName - 迁移脚本文件名 (如 `account_init.sort_1.sql`)
     * @param {string|null} fileContent - 脚本文件文本内容
     * @param {string|null} failedReason - 执行失败原因 (成功时为 null)
     * @param {string} backupFile - 执行前创建的备份文件名
     * @returns {Promise<ExecResult>}
     */
    insertOne: (fileName, fileContent, failedReason, backupFile) => {
        const sql = 'INSERT INTO migrations(file_name, file_content, successful, failed_reason, backup_file) VALUES(?,?,?,?,?)';
        return __sqliteDB.insert(sql, [fileName, fileContent, __isNotBlank(failedReason) ? 0 : 1, failedReason ?? null, backupFile], null, dbName);
    },

    /**
     * 查询指定名称的迁移脚本是否已经成功执行过
     * @param {string} fileName - 迁移脚本文件名
     * @returns {Promise<{ exists: number }|null>} 存在且成功返回 `{ exists: 1 }`，否则返回 `{ exists: 0 }` 或 null
     */
    selectExists: (fileName) => {
        const sql = 'SELECT EXISTS (SELECT 1 FROM migrations WHERE file_name=? AND successful=1) AS [exists]';
        return __sqliteDB.selectOne(sql, [fileName], null, dbName);
    }
};