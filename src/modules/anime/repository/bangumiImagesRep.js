import { BANGUMI_IMAGES_STATUS } from "../constants/subjectConstant.js"

const dbName = `anime`

export default {
    insertOne: data => {
        const sql = `INSERT OR IGNORE INTO bangumi_images (link, minio_link, origin_url, status) VALUES (?,?,?,?)`;
        const params = [data.link, data.minioLink, data.originUrl, BANGUMI_IMAGES_STATUS.PREPARED];
        return __sqliteDB.insert(sql, params, null, dbName);
    },
    insertBatch: dataList => {
        const sql = `INSERT OR IGNORE INTO bangumi_images (link, minio_link, origin_url, status) VALUES ${dataList.map(() => '(?,?,?,?)').join(',')}`;
        const params = dataList.flatMap(data => ([data.link, data.minioLink, data.originUrl, BANGUMI_IMAGES_STATUS.PREPARED]));
        return __sqliteDB.insert(sql, params, null, dbName);
    },
    selectPreparedImagesWithLimit: (limit) => {
        const sql = `SELECT id, link, minio_link, origin_url, status FROM bangumi_images WHERE status=? LIMIT ?`;
        const params = [BANGUMI_IMAGES_STATUS.PREPARED, limit];
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },
    updatePreparedImagePending: (imageId) => {
        const sql = `UPDATE bangumi_images SET status=? WHERE id=? AND status=?`;
        const params = [BANGUMI_IMAGES_STATUS.PENDING, imageId, BANGUMI_IMAGES_STATUS.PREPARED];
        return __sqliteDB.update(sql, params, null, dbName);
    },
    updateImageStatusBatch: (imageIds, status) => {
        const sql = `UPDATE bangumi_images SET status=? WHERE id IN (${imageIds.map(() => '?').join(',')})`;
        return __sqliteDB.update(sql, [status, ...imageIds], null, dbName);
    },
    selectByLink: link => {
        const sql = `SELECT id, link, minio_link FROM bangumi_images WHERE link=? AND status=?`;
        const params = [link, BANGUMI_IMAGES_STATUS.COMPLETE];
        return __sqliteDB.selectOne(sql, params, null, dbName);
    }
}