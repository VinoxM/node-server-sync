import { BANGUMI_IMAGES_STATUS } from "../constants/subjectConstant.js";

const dbName = `anime`;

/**
 * Bangumi 图片持久化缓存仓储服务
 */
export default {
    /**
     * 插入单条待同步图片记录
     * @param {Object} data - 图片数据
     * @param {string} data.link - 相对存储路径
     * @param {string} data.minioLink - 目标 MinIO 完整路径
     * @param {string} data.originUrl - 原始抓取网络 URL
     * @returns {Promise<ExecResult>}
     */
    insertOne: data => {
        const sql = `INSERT OR IGNORE INTO bangumi_images (link, minio_link, origin_url, status) VALUES (?,?,?,?)`;
        const params = [data.link, data.minioLink, data.originUrl, BANGUMI_IMAGES_STATUS.PREPARED];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 批量插入待同步图片记录
     * @param {Array<{ link: string, minioLink: string, originUrl: string }>} dataList - 图片列表
     * @returns {Promise<ExecResult>}
     */
    insertBatch: dataList => {
        const sql = `INSERT OR IGNORE INTO bangumi_images (link, minio_link, origin_url, status) VALUES ${dataList.map(() => '(?,?,?,?)').join(',')}`;
        const params = dataList.flatMap(data => ([data.link, data.minioLink, data.originUrl, BANGUMI_IMAGES_STATUS.PREPARED]));
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 查询指定数量待同步 (PREPARED) 的图片记录
     * @param {number} limit - 最大条数
     * @returns {Promise<QueryResult<{ id: number, link: string, minioLink: string, originUrl: string, status: number }>>}
     */
    selectPreparedImagesWithLimit: (limit) => {
        const sql = `SELECT id, link, minio_link, origin_url, status FROM bangumi_images WHERE status=? LIMIT ?`;
        const params = [BANGUMI_IMAGES_STATUS.PREPARED, limit];
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 将待同步图片标记为处理中 (PENDING)
     * @param {number} imageId - 主键 ID
     * @returns {Promise<ExecResult>}
     */
    updatePreparedImagePending: (imageId) => {
        const sql = `UPDATE bangumi_images SET status=? WHERE id=? AND status=?`;
        const params = [BANGUMI_IMAGES_STATUS.PENDING, imageId, BANGUMI_IMAGES_STATUS.PREPARED];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 批量更新图片状态
     * @param {number[]} imageIds - 主键 ID 数组
     * @param {number} status - 目标状态
     * @returns {Promise<ExecResult>}
     */
    updateImageStatusBatch: (imageIds, status) => {
        const sql = `UPDATE bangumi_images SET status=? WHERE id IN (${imageIds.map(() => '?').join(',')})`;
        return __sqliteDB.update(sql, [status, ...imageIds], null, dbName);
    },

    /**
     * 根据相对链接查询已同步完成 (COMPLETE) 的图片信息
     * @param {string} link - 相对链接
     * @returns {Promise<{ id: number, link: string, minioLink: string }|null>}
     */
    selectByLink: link => {
        const sql = `SELECT id, link, minio_link FROM bangumi_images WHERE link=? AND status=?`;
        const params = [link, BANGUMI_IMAGES_STATUS.COMPLETE];
        return __sqliteDB.selectOne(sql, params, null, dbName);
    },

    /**
     * 模糊删除指定前缀链接的图片缓存记录
     * @param {string} link - 前缀链接
     * @returns {Promise<ExecResult>}
     */
    deleteByLinkLikely: link => {
        const sql = `DELETE FROM bangumi_images WHERE link LIKE ?`;
        return __sqliteDB.delete(sql, [`${link}%`], null, dbName);
    }
};