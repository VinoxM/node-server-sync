const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertOne: (aria2Task) => {
        const { minioId, gid, status, filePath, fileNum } = aria2Task
        const sql = `INSERT INTO aria2_task(minio_id, gid, status, file_path, file_num) VALUES(?,?,?,?,?)`
        const params = [minioId, gid, status, filePath, fileNum]
        return sqliteDB.insert(sql, params, null, dbName)
    },
    updateStatusByMinioId: (minioId, status) => {
        const sql = `UPDATE aria2_task SET status=? WHERE minio_id=?`
        const params = [status, minioId]
        return sqliteDB.update(sql, params, null, dbName)
    },
    updateStatusByMinioIds: (minioIds, status) => {
        let sql = `UPDATE aria2_task SET status=? WHERE minio_id IN (`
        sql += minioIds.map(() => "?").join(',') + ')'
        const params = [status, ...minioIds]
        return sqliteDB.update(sql, params, null, dbName)
    },
    selectByGid: gid => {
        const sql = `SELECT minio_id, gid, status, file_path, file_num FROM aria2_task WHERE gid=?`
        return sqliteDB.selectOne(sql, [gid], null, dbName)
    },
    selectByMinioId: minioId => {
        let sql = `SELECT minio_id, gid, status, file_path, file_num FROM aria2_task WHERE minio_id=?`
        return sqliteDB.selectAll(sql, [minioId], null, dbName)
    },
    selectByMinioIds: minioIds => {
        if (isEmptyArray(minioIds)) return Promise.resolve()
        let sql = `SELECT minio_id, gid, status, file_path, file_num FROM aria2_task WHERE minio_id IN (`
        sql += minioIds.map(() => "?").join(',') + ')'
        return sqliteDB.selectAll(sql, minioIds, null, dbName)
    },
    deleteByGid: gid => {
        const sql = `DELETE FROM aria2_task WHERE gid=?`
        return sqliteDB.delete(sql, [gid], null, dbName)
    },
    deleteByMinioIds: minioIds => {
        if (isEmptyArray(minioIds)) return Promise.resolve()
        const sql = `DELETE FROM aria2_task WHERE minio_id= IN(`
        sql += minioIds.map(() => "?").join(',') + ')'
        return sqliteDB.delete(sql, minioIds, null, dbName)
    }
}