import { MEDIA_TYPE_DESCRIPTION } from "../constants/mediaConst.js"
import { HybridLRUCache } from "../../../core/infra/extendMap.js"

const dbName = 'media'
const enablePrint = { print: true }

const existsCache = new HybridLRUCache(1000);
const existsTtl = 1000 * 60 * 6
function generateExistsKey(categoryId, authorId, uniqueId) {
    return `${categoryId}::${authorId || 'null'}::${uniqueId || 'null'}`
}
function clearExistsCache(categoryId, authorId, uniqueId) {
    existsCache.delete(generateExistsKey(categoryId, authorId, uniqueId))
    existsCache.delete(generateExistsKey(categoryId, authorId, null))
    existsCache.delete(generateExistsKey(categoryId, null, uniqueId))
    existsCache.delete(generateExistsKey(categoryId, null, null))
}

export default {
    selectForExists: async (categoryId, authorId, uniqueId) => {
        const existsKey = generateExistsKey(categoryId, authorId, uniqueId)
        if (existsCache.has(existsKey)) {
            return existsCache.get(existsKey)
        }
        let sql = `SELECT EXISTS(SELECT 1 FROM videos WHERE category_id=?`;
        const params = [categoryId];
        if (authorId) {
            sql += ` AND author_id=?`;
            params.push(authorId);
        }
        if (uniqueId) {
            sql += ` AND unique_id=?`;
            params.push(uniqueId);
        }
        sql += `) as result`;
        const exists = await __sqliteDB.selectOne(sql, params, null, dbName).then(({ result }) => !!result)
        existsCache.set(existsKey, exists, existsTtl)
        return exists
    },
    selectByUniqueIds: async (uniqueIds, categoryId) => {
        const sql = 'SELECT v.id,v.author_id,a.name AS authorName,v.unique_id FROM videos v'
            + ' LEFT JOIN authors a ON a.id=v.author_id '
            + ' WHERE v.category_id=? AND v.unique_id IN (' + new Array(uniqueIds.length).fill('?').join(',') + ')'
        return __sqliteDB.selectAll(sql, [categoryId, ...uniqueIds], null, dbName)
    },
    insertOne: async video => {
        const sql = 'INSERT INTO videos(unique_id, title, category_id, author_id, upload_time, status, create_time) VALUES(?,?,?,?,?,?,?)'
        const params = [video.uniqueId, video.title, video.categoryId, video.authorId, video.uploadTime, video.status, new Date()]
        const res = await __sqliteDB.insert(sql, params, null, dbName)
        res.rows > 0 && clearExistsCache(video.categoryId, video.authorId, video.uniqueId)
        return res
    },
    updateMinioIdById: (videoId, minioId, type) => {
        const columnName = MEDIA_TYPE_DESCRIPTION[type] + '_id'
        const sql = `UPDATE videos SET ${columnName}=? WHERE id=?`
        return __sqliteDB.update(sql, [minioId, videoId], null, dbName)
    },
    updateVideoStatus: (videoId, status) => {
        const sql = 'UPDATE videos SET status=? WHERE id=?'
        const params = [status, videoId]
        return __sqliteDB.update(sql, params, null, dbName)
    },
    updateVideoTitle: (videoId, title) => {
        const sql = 'UPDATE videos SET title=? WHERE id=?'
        const params = [title, videoId]
        return __sqliteDB.update(sql, params, null, dbName)
    },
    selectOne: videoId => {
        const sql = 'SELECT id, unique_id, title, author_id, category_id, upload_time, status, create_time FROM videos WHERE id=?'
        return __sqliteDB.selectOne(sql, [videoId], null, dbName)
    },
    deleteOne: async videoId => {
        const result = { rows: 0 }
        const video = await __sqliteDB.selectOne('SELECT unique_id, author_id, category_id FROM videos WHERE id=?', [videoId], null, dbName)
        if (video) {
            const sql = 'DELETE FROM videos WHERE id=?'
            const res = await __sqliteDB.delete(sql, [videoId], null, dbName)
            res.rows > 0 && clearExistsCache(video.categoryId, video.authorId, video.uniqueId)
            result.rows = res.rows
        }
        return result
    },
    selectForSearch: (title, categoryId, authorId, tagNames, status, currentPage, pageSize) => {
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
        if (status) {
            sqlConcat.push(' tv.status = ?');
            params.push(status);
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
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },
    countForSearch: (title, categoryId, authorId, tagNames, status) => {
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
        if (status) {
            sqlConcat.push(' tv.status = ?');
            params.push(status);
        }
        if (sqlConcat.length > 0) {
            sql += ' WHERE ' + sqlConcat.join(' AND ');
        }
        return __sqliteDB.selectOne(sql, params, null, dbName).then(({ total }) => total || 0);
    }
}