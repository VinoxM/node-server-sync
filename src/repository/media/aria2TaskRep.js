const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertOne: (aria2Task) => {
        const { minioId, gid, status, filePath, fileNum } = aria2Task
        const sql = `INSERT INTO aria2_task(minio_id, gid, status, file_path, file_num) VALUES(?,?,?,?,?)`
        const params = [minioId, gid, status, filePath, fileNum]
        return sqliteDB.insert(sql, params, null, dbName)
    },
    updateStatusById: (status, id) => {
        const sql = `UPDATE aria2_task SET status=? WHERE id=?`
        const params = [status, id]
        return sqliteDB.update(sql, params, null, dbName)
    },
    updateFilePathById: (filePath, id) => {
        const sql = `UPDATE aria2_task SET file_path=? WHERE id=?`
        const params = [filePath, id]
        return sqliteDB.update(sql, params, null, dbName)
    },
    selectByGid: gid => {
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE gid=?`
        return sqliteDB.selectOne(sql, [gid], null, dbName)
    },
    selectById: id => {
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE id=?`
        return sqliteDB.selectOne(sql, [id], null, dbName)
    },
    selectByMinioId: minioId => {
        let sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE minio_id=?`
        return sqliteDB.selectAll(sql, [minioId], null, dbName)
    },
    deleteById: id => {
        const sql = `DELETE FROM aria2_task WHERE id=?`
        return sqliteDB.delete(sql, [id], null, dbName)
    }
}