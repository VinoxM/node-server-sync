import { MEDIA_MINIO_STATUS, MEDIA_VIDEO_MINIO_TYPE } from "../constants/mediaConst.js";

const dbName = 'media';
const enablePrint = { print: true };

/**
 * 视频关联 MinIO 对象文件（封面图/视频流/弹幕等）数据访问仓库
 */
export default {
    /**
     * 检查指定视频是否存在处于上传中 (UPLOADING) 状态的 MinIO 资源
     * @param {number} videoId - 视频 ID
     * @returns {Promise<number>} 1 表示存在，0 表示不存在
     */
    selectUploadingMinioExistsByVideoId: async videoId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM video_minio WHERE video_id = ? AND status = ${MEDIA_MINIO_STATUS.UPLOADING} LIMIT 1) AS [exists]`;
        return __sqliteDB.selectOne(sql, [videoId], null, dbName).then(res => res?.exists ?? 0);
    },

    /**
     * 检查指定视频下是否存在指定类型的 MinIO 资源
     * @param {number} videoId - 视频 ID
     * @param {number} type - 资源类型 (MEDIA_VIDEO_MINIO_TYPE)
     * @returns {Promise<number>}
     */
    selectMinioExistsByVideoIdAndType: async (videoId, type) => {
        const sql = `SELECT EXISTS(SELECT 1 FROM video_minio WHERE video_id = ? AND type = ? LIMIT 1) AS [exists]`;
        return __sqliteDB.selectOne(sql, [videoId, type], null, dbName).then(res => res?.exists ?? 0);
    },

    /**
     * 根据主键 ID 查询单条 MinIO 资源记录
     * @param {number} id - 主键 ID
     * @returns {Promise<{ id: number, videoId: number, type: number, originUri: string, link: string, status: number, objectSize: string }|null>}
     */
    selectOneById: id => {
        const sql = 'SELECT id,video_id,type,origin_uri,link,status,object_size FROM video_minio WHERE id=?';
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 查询指定视频及资源类型下当前最大的排序权重 sort
     * @param {number} videoId - 视频 ID
     * @param {number} type - 资源类型
     * @returns {Promise<number>}
     */
    selectMaxSortOfType: (videoId, type) => {
        const sql = 'SELECT MAX(sort) AS sort FROM video_minio WHERE video_id=? AND type=?';
        return __sqliteDB.selectOne(sql, [videoId, type], null, dbName).then(data => (data?.sort ?? 0));
    },

    /**
     * 插入一条 MinIO 资源记录
     * @param {Object} minio - 资源参数
     * @param {number} minio.videoId - 关联的视频 ID
     * @param {number} minio.type - 资源类型 (MEDIA_VIDEO_MINIO_TYPE)
     * @param {string} minio.uri - 原始下载/抓取 URI
     * @param {string} [minio.link] - MinIO 最终访问链接
     * @param {string} [minio.title] - 资源标题/文件名
     * @param {number} minio.status - 初始任务状态
     * @param {number} [minio.sort] - 排序权重
     * @returns {Promise<ExecResult>}
     */
    insertOne: minio => {
        const sql = 'INSERT OR IGNORE INTO video_minio(video_id, type, origin_uri, link, title, status, sort) VALUES(?,?,?,?,?,?,?)';
        return __sqliteDB.insert(sql, [minio.videoId, minio.type, minio.uri, minio.link, minio.title, minio.status, minio.sort ?? 0], null, dbName);
    },

    /**
     * 更新 MinIO 资源状态
     * @param {number} id - 主键 ID
     * @param {number} status - 目标状态
     * @returns {Promise<ExecResult>}
     */
    updateStatusById: (id, status) => {
        const sql = 'UPDATE video_minio SET status=? WHERE id=?';
        return __sqliteDB.update(sql, [status, id], null, dbName);
    },

    /**
     * 乐观条件更新：仅在当前为 currentStatus 时更新为新状态
     * @param {number} id - 主键 ID
     * @param {number} status - 目标状态
     * @param {number} currentStatus - 预期当前状态
     * @returns {Promise<ExecResult>}
     */
    updateStatusByIdAndCurrentStatus: (id, status, currentStatus) => {
        const sql = 'UPDATE video_minio SET status=? WHERE id=? AND status=?';
        return __sqliteDB.update(sql, [status, id, currentStatus], null, dbName);
    },

    /**
     * 将未完成 (非 COMPLETE 且非 REMOVED) 的资源状态标记为 FAILED
     * @param {number} id - 主键 ID
     * @returns {Promise<ExecResult>}
     */
    setupFailedByIdWhenNotComplete: (id) => {
        const CAN_NOT_SETUP_FAILED_MINIO_STATUS = [MEDIA_MINIO_STATUS.COMPLETE, MEDIA_MINIO_STATUS.REMOVED];
        let sql = 'UPDATE video_minio SET status=? WHERE id=?';
        if (CAN_NOT_SETUP_FAILED_MINIO_STATUS.length > 0) {
            sql += ` AND status NOT IN (${CAN_NOT_SETUP_FAILED_MINIO_STATUS.join(',')})`;
        }
        return __sqliteDB.update(sql, [MEDIA_MINIO_STATUS.FAILED, id], null, dbName);
    },

    /**
     * 更新资源的原始 URI
     * @param {string} originUri - 原始抓取 URI
     * @param {number} id - 主键 ID
     * @returns {Promise<ExecResult>}
     */
    updateOriginUriById: (originUri, id) => {
        const sql = 'UPDATE video_minio SET origin_uri=? WHERE id=?';
        return __sqliteDB.update(sql, [originUri, id], null, dbName);
    },

    /**
     * 更新资源的标题与排序号
     * @param {string} title - 标题
     * @param {number} sort - 排序号
     * @param {number} id - 主键 ID
     * @returns {Promise<ExecResult>}
     */
    updateTitleAndSortById: (title, sort, id) => {
        const sql = 'UPDATE video_minio SET title=?, sort=? WHERE id=?';
        return __sqliteDB.update(sql, [title, sort, id], null, dbName);
    },

    /**
     * 删除已标记为 REMOVED 状态的 MinIO 资源记录
     * @param {number} minioId - 主键 ID
     * @returns {Promise<ExecResult>}
     */
    deleteByMinioId: minioId => {
        const sql = `DELETE FROM video_minio WHERE id = ? AND status=${MEDIA_MINIO_STATUS.REMOVED}`;
        return __sqliteDB.delete(sql, [minioId], null, dbName);
    },

    /**
     * 根据视频 ID 查询其下的全部 MinIO 资源明细列表
     * @param {number} videoId - 视频 ID
     * @returns {Promise<QueryResult<{ id: number, videoId: number, type: number, originUri: string, link: string, title: string, status: number, sort: number, objectSize: string }>>}
     */
    selectByVideoId: videoId => {
        const sql = `SELECT id, video_id, type, origin_uri, link, title, status, sort, object_size FROM video_minio WHERE video_id=?`;
        return __sqliteDB.selectAll(sql, [videoId], null, dbName);
    },

    /**
     * 根据 MinIO 资源 ID 数组批量查询
     * @param {number[]} minioIds - 主键 ID 数组
     * @returns {Promise<QueryResult<{ id: number, videoId: number, type: number, originUri: string, link: string, title: string, status: number, sort: number, objectSize: string }>>}
     */
    selectByMinioIds: async minioIds => {
        if (__isEmptyArray(minioIds)) {
            return { rows: 0, data: [] };
        }
        const sql = `SELECT id, video_id, type, origin_uri, link, title, status, sort, object_size FROM video_minio WHERE id IN (${minioIds.map(() => '?').join(',')})`;
        return __sqliteDB.selectAll(sql, minioIds, null, dbName);
    },

    /**
     * 查询指定视频下已完成上传的全部视频源 (SOURCE) 列表，按 sort 升序排序
     * @param {number} videoId - 视频 ID
     * @returns {Promise<QueryResult<{ id: number, link: string, title: string, sort: number }>>}
     */
    selectSourceByVideoId: videoId => {
        const sql = `SELECT id, link, title, sort FROM video_minio WHERE video_id=? AND type=${MEDIA_VIDEO_MINIO_TYPE.SOURCE} AND status=${MEDIA_MINIO_STATUS.COMPLETE} ORDER BY sort`;
        return __sqliteDB.selectAll(sql, [videoId], null, dbName);
    },

    /**
     * 查询指定视频下已完成上传的全部弹幕 (BARRAGE) 列表，按 sort 升序排序
     * @param {number} videoId - 视频 ID
     * @returns {Promise<QueryResult<{ id: number, link: string, title: string, sort: number }>>}
     */
    selectBarrageByVideoId: videoId => {
        const sql = `SELECT id, link, title, sort FROM video_minio WHERE video_id=? AND type=${MEDIA_VIDEO_MINIO_TYPE.BARRAGE} AND status=${MEDIA_MINIO_STATUS.COMPLETE} ORDER BY sort`;
        return __sqliteDB.selectAll(sql, [videoId], null, dbName);
    },

    /**
     * 更新 MinIO 对象占用的存储大小 (object_size)
     * @param {string|number} objectSize - 对象大小 (字节文本)
     * @param {number} id - 主键 ID
     * @returns {Promise<ExecResult>}
     */
    updateObjectSizeById: (objectSize, id) => {
        const sql = `UPDATE video_minio SET object_size=? WHERE id=?`;
        return __sqliteDB.update(sql, [objectSize, id], null, dbName);
    },

    /**
     * 计算指定视频下所有已就绪 MinIO 资源的对象存储总大小（转换为字符串）
     * @param {number} videoId - 视频 ID
     * @returns {Promise<string>} 总字节大小文本
     */
    selectTotalSizeByVideoId: async videoId => {
        const sql = `SELECT CAST(IFNULL(SUM(CAST(object_size AS INTEGER)), 0) AS TEXT) AS videoTotalSize FROM video_minio WHERE video_id = ? AND status = ?`;
        return __sqliteDB.selectOne(sql, [videoId, MEDIA_MINIO_STATUS.COMPLETE], null, dbName).then(data => data?.videoTotalSize ?? '0');
    }
};