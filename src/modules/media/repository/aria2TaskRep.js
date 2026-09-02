import { MEDIA_ARIA2_TASK_STATUS } from "../constants/mediaConst.js";

const dbName = 'media';
const enablePrint = { print: true };

/**
 * 媒体 Aria2 下载任务持久化数据访问仓库
 */
export default {
    /**
     * 插入一条新的 Aria2 下载任务记录
     * @param {Object} aria2Task - 任务信息
     * @param {number} aria2Task.minioId - 关联的 video_minio 主键 ID
     * @param {string} aria2Task.gid - Aria2 任务 GID
     * @param {number} aria2Task.status - 初始任务状态 (MEDIA_ARIA2_TASK_STATUS)
     * @param {string} aria2Task.filePath - 本地/临时下载文件绝对路径
     * @param {number} [aria2Task.fileNum] - 分片/序号
     * @returns {Promise<ExecResult>}
     */
    insertOne: (aria2Task) => {
        const { minioId, gid, status, filePath, fileNum } = aria2Task;
        const sql = `INSERT INTO aria2_task(minio_id, gid, status, file_path, file_num) VALUES(?,?,?,?,?)`;
        const params = [minioId, gid, status, filePath, fileNum];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 根据主键 ID 更新任务状态
     * @param {number} status - 目标状态
     * @param {number} id - 记录 ID
     * @returns {Promise<ExecResult>}
     */
    updateStatusById: (status, id) => {
        let sql = `UPDATE aria2_task SET status=? WHERE id=?`;
        const params = [status, id];
        if (status === MEDIA_ARIA2_TASK_STATUS.DOWNLOADING) {
            sql += ' AND status=?';
            params.push(MEDIA_ARIA2_TASK_STATUS.PREPARED);
        }
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 根据主键 ID 更新下载文件路径
     * @param {string} filePath - 新的文件路径
     * @param {number} id - 记录 ID
     * @returns {Promise<ExecResult>}
     */
    updateFilePathById: (filePath, id) => {
        const sql = `UPDATE aria2_task SET file_path=? WHERE id=?`;
        const params = [filePath, id];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 根据 GID 查询任务记录
     * @param {string} gid - Aria2 GID
     * @returns {Promise<{ id: number, minioId: number, gid: string, status: number, filePath: string, fileNum: number }|null>}
     */
    selectByGid: gid => {
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE gid=?`;
        return __sqliteDB.selectOne(sql, [gid], null, dbName);
    },

    /**
     * 根据主键 ID 查询任务记录
     * @param {number} id - 记录 ID
     * @returns {Promise<{ id: number, minioId: number, gid: string, status: number, filePath: string, fileNum: number }|null>}
     */
    selectById: id => {
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE id=?`;
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 根据主键 ID 数组批量查询任务记录列表
     * @param {number[]} ids - 记录 ID 数组
     * @returns {Promise<QueryResult<{ id: number, minioId: number, gid: string, status: number, filePath: string, fileNum: number }>>}
     */
    selectByIds: ids => {
        if (__isEmptyArray(ids)) {
            return Promise.resolve({ rows: 0, data: [] });
        }
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE id IN(`
            + ids.map(() => '?').join(',') + ')';
        return __sqliteDB.selectAll(sql, ids, null, dbName);
    },

    /**
     * 根据关联的 minioId 查询任务记录列表
     * @param {number} minioId - video_minio 主键 ID
     * @returns {Promise<QueryResult<{ id: number, minioId: number, gid: string, status: number, filePath: string, fileNum: number }>>}
     */
    selectByMinioId: minioId => {
        let sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE minio_id=?`;
        return __sqliteDB.selectAll(sql, [minioId], null, dbName);
    },

    /**
     * 根据关联的 minioId 数组批量查询任务记录列表
     * @param {number[]} minioIds - minioId 数组
     * @returns {Promise<QueryResult<{ id: number, minioId: number, gid: string, status: number, filePath: string, fileNum: number }>>}
     */
    selectByMinioIds: minioIds => {
        if (__isEmptyArray(minioIds)) {
            return Promise.resolve({ rows: 0, data: [] });
        }
        const sql = `SELECT id, minio_id, gid, status, file_path, file_num FROM aria2_task WHERE minio_id IN (${minioIds.map(() => '?').join(',')})`;
        return __sqliteDB.selectAll(sql, minioIds, null, dbName);
    },

    /**
     * 判断指定 minioId 是否存在对应的 Aria2 任务
     * @param {number} minioId - video_minio 主键 ID
     * @returns {Promise<{ exists: number }|null>}
     */
    selectExistsByMinioId: minioId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM aria2_task WHERE minio_id = ? LIMIT 1) AS [exists]`;
        return __sqliteDB.selectOne(sql, [minioId], null, dbName);
    },

    /**
     * 根据主键 ID 删除任务记录
     * @param {number} id - 记录 ID
     * @returns {Promise<ExecResult>}
     */
    deleteById: id => {
        const sql = `DELETE FROM aria2_task WHERE id=?`;
        return __sqliteDB.delete(sql, [id], null, dbName);
    }
};