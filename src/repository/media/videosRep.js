import { MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_STATUS } from "../../constraints/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectForExists: (categoryId, authorId, uniqueId) => {
        let sql = `SELECT COUNT(*) count FROM videos WHERE category_id=?`
        const params = [categoryId]
        if (authorId) {
            sql += ` AND author_id=?`
            params.push(authorId)
        }
        sql += ` AND unique_id=? AND status!=?`
        params.push(uniqueId, MEDIA_VIDEO_STATUS.REMOVED)
        return sqliteDB.selectOne(sql, params, null, dbName).then(({ count }) => count)
    },
    insertOne: video => {
        const sql = 'INSERT INTO videos(unique_id, title, category_id, author_id, upload_time, status, create_time) VALUES(?,?,?,?,?,?,?)'
        const params = [video.uniqueId, video.title, video.categoryId, video.authorId, video.uploadTime, video.status, new Date()]
        return sqliteDB.insert(sql, params, null, dbName)
    },
    updateMinioIdById: (videoId, minioId, type) => {
        const columnName = MEDIA_TYPE_DESCRIPTION[type] + '_id'
        const sql = `UPDATE videos SET ${columnName}=? WHERE id=?`
        return sqliteDB.update(sql, [minioId, videoId], null, dbName)
    },
    updateVideoStatus: (videoId, status) => {
        const sql = 'UPDATE videos SET status=? WHERE id=?'
        const params = [status, videoId]
        return sqliteDB.update(sql, params, null, dbName)
    },
    updateVideoTitle: (videoId, title) => {
        const sql = 'UPDATE videos SET title=? WHERE id=?'
        const params = [title, videoId]
        return sqliteDB.update(sql, params, null, dbName)
    },
    selectOne: videoId => {
        const sql = 'SELECT id, unique_id, title, author_id, category_id, upload_time, status, create_time FROM videos WHERE id=?'
        return sqliteDB.selectOne(sql, [videoId], null, dbName)
    },
    deleteOne: videoId => {
        const sql = 'DELETE FROM videos WHERE id=?'
        return sqliteDB.delete(sql, [videoId], null, dbName)
    },
    selectForSearch: (title, categoryId, authorId, tagNames, currentPage, pageSize) => {
        let sql = `SELECT `
            + `tv.id, tv.unique_id, tv.title, tv.author_id, ta.name AS author, `
            + `tv.category_id, tc.name AS category, tv.upload_time, tv.status, tv.create_time, `
            + `MAX(CASE WHEN tm.type = 1 THEN tm.link ELSE NULL END) AS source, `
            + `MAX(CASE WHEN tm.type = 2 THEN tm.link ELSE NULL END) AS cover `
            + `FROM videos tv `
            + `LEFT JOIN categories tc ON tc.id = tv.category_id `
            + `LEFT JOIN authors ta ON ta.id = tv.author_id AND ta.category_id = tv.category_id `
            + `LEFT JOIN video_minio tm ON tm.video_id = tv.id `;
        const sqlConcat = [];
        const params = [];
        if (tagNames) {
            const tagList = Array.isArray(tagNames) ? tagNames : [tagNames];
            if (tagList.length > 0) {
                const placeholders = tagList.map(() => '?').join(',');
                sqlConcat.push(` tv.id IN (`
                    + `SELECT vtm.video_id `
                    + `FROM video_tag_map vtm `
                    + `JOIN tags tt ON vtm.tag_id = tt.id `
                    + `WHERE tt.name IN (${placeholders}) `
                    + `GROUP BY vtm.video_id `
                    + `HAVING COUNT(DISTINCT tt.id) = ?`
                    + `)`);
                tagList.forEach(name => params.push(name));
                params.push(tagList.length);
            }
        }
        if (categoryId) {
            sqlConcat.push(' tv.category_id = ?');
            params.push(categoryId);
        }
        if (authorId) {
            sqlConcat.push(' tv.author_id = ?');
            params.push(authorId);
        }
        if (title) {
            sqlConcat.push(' tv.title LIKE ?');
            params.push(`%${title}%`);
        }
        sqlConcat.push(' tv.status != ?');
        params.push(MEDIA_VIDEO_STATUS.REMOVED);
        if (sqlConcat.length > 0) {
            sql += ' WHERE ' + sqlConcat.join(' AND ');
        }
        sql += ' GROUP BY tv.id';
        sql += ' ORDER BY tv.upload_time DESC, tv.id DESC';
        if (currentPage !== undefined && pageSize !== undefined) {
            const offset = (currentPage - 1) * pageSize;
            sql += ' LIMIT ? OFFSET ?';
            params.push(pageSize, offset);
        }
        return sqliteDB.selectAll(sql, params, null, dbName);
    },
    countForSearch: (title, categoryId, authorId, tagNames) => {
        let sql = `SELECT COUNT(DISTINCT tv.id) as total FROM videos tv `;
        const sqlConcat = [];
        const params = [];
        if (tagNames) {
            const tagList = Array.isArray(tagNames) ? tagNames : [tagNames];
            if (tagList.length > 0) {
                const placeholders = tagList.map(() => '?').join(',');
                sqlConcat.push(` tv.id IN (`
                    + `SELECT vtm.video_id `
                    + `FROM video_tag_map vtm `
                    + `JOIN tags tt ON vtm.tag_id = tt.id `
                    + `WHERE tt.name IN (${placeholders}) `
                    + `GROUP BY vtm.video_id `
                    + `HAVING COUNT(DISTINCT tt.id) = ?`
                    + `)`);
                tagList.forEach(name => params.push(name));
                params.push(tagList.length);
            }
        }
        if (categoryId) {
            sqlConcat.push(' tv.category_id = ?');
            params.push(categoryId);
        }
        if (authorId) {
            sqlConcat.push(' tv.author_id = ?');
            params.push(authorId);
        }
        if (title) {
            sqlConcat.push(' tv.title LIKE ?');
            params.push(`%${title}%`);
        }
        sqlConcat.push(' tv.status != ?');
        params.push(MEDIA_VIDEO_STATUS.REMOVED);
        if (sqlConcat.length > 0) {
            sql += ' WHERE ' + sqlConcat.join(' AND ');
        }
        return sqliteDB.selectOne(sql, params, null, dbName).then(({ total }) => total || 0);
    }
}