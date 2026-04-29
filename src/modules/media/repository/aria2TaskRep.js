import { MEDIA_ARIA2_TASK_STATUS } from "../constants/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertOne: (aria2Task) => {
        const { minioId, gid, status, filePath, fileNum } = aria2Task
        const sql = `INSERT INTO aria2_task(minio_id, gid, status, file_path, file_num) VALUES(?,?,?,?,?)`
        const params = [minioId, gid, status, filePath, fileNum]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    updateStatusById: (status, id) => {
        let sql = `UPDATE aria2_task SET status=? WHERE id=?`
        const params = [status, id]
        if (status === MEDIA_ARIA2_TASK_STATUS.DOWNLOADING) {
            sql += ' AND status=?'
            params.push(MEDIA_ARIA2_TASK_STATUS.PREPARED)
        }
        return __sqliteDB.update(sql, params, null, dbName)
    },
    updateFilePathById: (filePath, id) => {
        const sql = `UPDATE aria2_task SET file_path=? WHERE id=?`
        const params = [filePath, id]
        return __sqliteDB.update(sql, params, null, dbName)
    },
    selectByGid: gid => {
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE gid=?`
        return __sqliteDB.selectOne(sql, [gid], null, dbName)
    },
    selectById: id => {
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE id=?`
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    selectByIds: ids => {
        if (__isEmptyArray(ids)) {
            return { rows: 0, data: [] }
        }
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE id IN(`
            + ids.map(() => '?').join(',') + ')'
        return __sqliteDB.selectAll(sql, ids, null, dbName)
    },
    selectByMinioId: minioId => {
        let sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE minio_id=?`
        return __sqliteDB.selectAll(sql, [minioId], null, dbName)
    },
    selectByMinioIds: minioIds => {
        if (__isEmptyArray(minioIds)) {
            return { rows: 0, data: [] }
        }
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE minio_id IN (${minioIds.map(() => '?').join(',')})`
        return __sqliteDB.selectAll(sql, minioIds, null, dbName)
    },
    selectExistsByMinioId: minioId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM aria2_task WHERE minio_id = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [minioId], null, dbName)
    },
    deleteById: id => {
        const sql = `DELETE FROM aria2_task WHERE id=?`
        return __sqliteDB.delete(sql, [id], null, dbName)
    }
}