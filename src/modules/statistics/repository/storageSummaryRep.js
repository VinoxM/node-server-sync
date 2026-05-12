const dbName = 'statistics'

export default {
    insertOne: (totalCount, totalSize, dimensions) => {
        const sql = `INSERT INTO storage_summary(total_count, total_size, dimensions, summary_at) VALUES(?,?,?,?)`
        return __sqliteDB.insert(sql, [totalCount, totalSize, JSON.stringify(dimensions), new Date()], null, dbName)
    },
    selectLatest: () => {
        const sql = `SELECT id, total_count, total_size, dimensions, summary_at FROM storage_summary ORDER BY id DESC LIMIT 1`
        return __sqliteDB.selectOne(sql, [], null, dbName)
    }
}