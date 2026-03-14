import { MEDIA_TYPE_DESCRIPTION } from "../../constraints/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectForExists: (categoryId, authorId, uniqueId) => {
        const sql = 'SELECT COUNT(*) count FROM videos WHERE category_id=? AND author_id=? AND unique_id=?'
        const params = [categoryId, authorId, uniqueId]
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
    selectOne: videoId => {
        const sql = 'SELECT id, unique_id, title, author_id, category_id, upload_time, status, create_time FROM videos WHERE id=?'
        return sqliteDB.selectOne(sql, [videoId], null, dbName)
    },
    deleteOne: videoId => {
        const sql = 'DELETE FROM videos WHERE id=?'
        return sqliteDB.delete(sql, [videoId], null, dbName)
    },
    selectForSearch: (title, categoryId, authorId, currentPage, pageSize) => {
        let sql = `SELECT `
            + `tv.id, tv.unique_id, tv.title, tv.author_id, ta.name AS author, `
            + `tv.category_id, tc.name AS category, tv.upload_time, tv.status, tv.create_time, tv.upload_time, `
            + `MAX(CASE WHEN tm.type = 1 THEN tm.link ELSE NULL END) AS source, `
            + `MAX(CASE WHEN tm.type = 2 THEN tm.link ELSE NULL END) AS cover `
            + `FROM videos tv `
            + `LEFT JOIN categories tc ON tc.id = tv.category_id `
            + `LEFT JOIN authors ta ON ta.id = tv.author_id AND ta.category_id = tv.category_id `
            + `LEFT JOIN video_minio tm ON tm.video_id = tv.id `;
        const sqlConcat = [];
        const params = [];
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
    countForSearch: (title, categoryId, authorId) => {
        let sql = `SELECT COUNT(DISTINCT tv.id) as total FROM videos tv `;
        const sqlConcat = [];
        const params = [];
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
        if (sqlConcat.length > 0) {
            sql += ' WHERE ' + sqlConcat.join(' AND ');
        }
        return sqliteDB.selectOne(sql, params, null, dbName).then(({ total }) => total);
    }
}