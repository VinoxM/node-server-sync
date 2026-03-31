const dbName = 'execution'
const enablePrint = { print: true }

export default {
    insertOne: (fileName, fileContent, failedReason, backupFile) => {
        const sql = 'INSERT INTO migrations(file_name, file_content, successful, failed_reason, backup_file) VALUES(?,?,?,?,?)'
        return __sqliteDB.insert(sql, [fileName, fileContent, __isNotBlank(failedReason) ? 0 : 1, failedReason ?? null, backupFile], null, dbName);
    },
    selectExists: (fileName) => {
        const sql = 'SELECT EXISTS (SELECT 1 FROM migrations WHERE file_name=? AND successful=1) AS [exists]'
        return __sqliteDB.selectOne(sql, [fileName], null, dbName)
    }
}