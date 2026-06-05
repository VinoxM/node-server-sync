import {
    MEDIA_CATEGORY_TYPE, MEDIA_MINIO_STATUS,
    MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_MINIO_TYPE,
    MEDIA_VIDEO_STATUS
} from "../constants/mediaConst.js"
import { HybridLRUCache } from "../../../core/infra/extendMap.js"
import { FAVORITES_TARGET_TYPE } from "../constants/favoritesConst.js";

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

function tryResolveTime(time) {
    try {
        return new Date(time)
    } catch (ignored) {
        return new Date()
    }
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
        const params = [video.uniqueId, video.title, video.categoryId, video.authorId, tryResolveTime(video.uploadTime), video.status, new Date()]
        const res = await __sqliteDB.insert(sql, params, null, dbName)
        res.rows > 0 && clearExistsCache(video.categoryId, video.authorId, video.uniqueId)
        return res
    },
    updateMinioIdById: (videoId, minioId, type) => {
        const columnName = MEDIA_TYPE_DESCRIPTION[type] + '_id'
        const sql = `UPDATE videos SET ${columnName}=? WHERE id=?`
        return __sqliteDB.update(sql, [minioId, videoId], null, dbName)
    },
    updateVideoStatus: (videoId) => {
        const sql = `UPDATE videos `
                + `SET status = (`
                + `SELECT CASE `
                + `WHEN COUNT(CASE WHEN vm.type = ${MEDIA_VIDEO_MINIO_TYPE.COVER} AND vm.status = ${MEDIA_MINIO_STATUS.COMPLETE} THEN 1 END) = 0 `
                + `AND COUNT(CASE WHEN vm.type = ${MEDIA_VIDEO_MINIO_TYPE.SOURCE} AND vm.status = ${MEDIA_MINIO_STATUS.COMPLETE} THEN 1 END) = 0 THEN 1 `
                + `WHEN COUNT(CASE WHEN vm.type = ${MEDIA_VIDEO_MINIO_TYPE.COVER} AND vm.status = ${MEDIA_MINIO_STATUS.COMPLETE} THEN 1 END) >= 1 `
                + `AND COUNT(CASE WHEN vm.type = ${MEDIA_VIDEO_MINIO_TYPE.SOURCE} AND vm.status = ${MEDIA_MINIO_STATUS.COMPLETE} THEN 1 END) >= 1 THEN 3 `
                + `ELSE 2 `
                + `END `
                + `FROM video_minio vm `
                + `WHERE vm.video_id = videos.id`
                + `) WHERE id = ? AND status != ${MEDIA_VIDEO_STATUS.REMOVED} `
                + `RETURNING status`;
        return __sqliteDB.selectOne(sql, [videoId], null, dbName).then(data => data.status)
    },
    updateVideoRemoved: videoId => {
        const sql = `UPDATE videos SET status=${MEDIA_VIDEO_STATUS.REMOVED} WHERE id=?`
        return __sqliteDB.update(sql, [videoId], null, dbName)
    },
    updateVideoTitle: (videoId, title) => {
        const sql = 'UPDATE videos SET title=? WHERE id=?'
        const params = [title, videoId]
        return __sqliteDB.update(sql, params, null, dbName)
    },
    selectOne: async (videoId, ignoreRemoved = false) => {
        let sql = 'SELECT id, unique_id, title, author_id, category_id, upload_time, status, create_time, total_size FROM videos WHERE id=?'
        if (ignoreRemoved) {
            sql += ` AND status!=${MEDIA_VIDEO_STATUS.REMOVED}`
        }
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
    /** Object Size */
    updateTotalSize: (videoId, totalSize) => {
        const sql = `UPDATE videos SET total_size=? WHERE id=?`
        return __sqliteDB.update(sql, [totalSize, videoId], null, dbName)
    },
    /** Search */
    selectForSearch: (isInside, title, categoryId, authorId, tagNames, status, pageNum, pageSize, needTotalSize = false, userId) => {
        let sqlConcat = [];
        let params = [];
        let categoryJoin = '';
        if (!categoryId) {
            categoryJoin = 'INNER JOIN categories tc_inner ON tc_inner.id = tv.category_id ';
            sqlConcat.push(' tc_inner.type = ?');
            params.push(isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL);
        } else {
            sqlConcat.push(' tv.category_id = ?');
            params.push(categoryId);
        }
        if (authorId) {
            sqlConcat.push(' tv.author_id = ?');
            params.push(authorId);
        }
        if (title) {
            sqlConcat.push(' tv.title LIKE ?');
            params.push('%' + title + '%');
        }
        if (status) {
            sqlConcat.push(' tv.status = ?');
            params.push(status);
        }
        if (tagNames) {
            const tagList = Array.isArray(tagNames) ? tagNames : [tagNames];
            if (tagList.length > 0) {
                const placeholders = tagList.map(function () { return '?'; }).join(',');
                sqlConcat.push(' tv.id IN ('
                    + 'SELECT vtm.video_id '
                    + 'FROM video_tag_map vtm '
                    + 'JOIN tags tt ON vtm.tag_id = tt.id '
                    + 'WHERE tt.name IN (' + placeholders + ') '
                    + 'GROUP BY vtm.video_id '
                    + 'HAVING COUNT(DISTINCT tt.id) = ?'
                    + ')');
                tagList.forEach(function (name) { params.push(name); });
                params.push(tagList.length);
            }
        }
        const whereClause = sqlConcat.length > 0 ? ' WHERE ' + sqlConcat.join(' AND ') : '';
        let limitOffset = '';
        if (pageNum !== undefined && pageSize !== undefined) {
            const offset = (pageNum - 1) * pageSize;
            limitOffset = ' LIMIT ' + pageSize + ' OFFSET ' + offset;
        }
        let sql = 'SELECT '
            + 'v.id, v.unique_id, v.title, v.author_id, v.category_id, '
            + 'v.upload_time, v.status, v.create_time, '
        if (needTotalSize) {
            sql += 'v.total_size, '
        }
        sql += 'tc.name AS category, '
            + 'ta.name AS author, '
            + '(SELECT link FROM video_minio WHERE video_id = v.id AND type = ' + MEDIA_VIDEO_MINIO_TYPE.COVER + ' LIMIT 1) AS cover '
        if (userId) {
            sql += ', CASE WHEN tf.id IS NULL THEN 0 ELSE 1 END AS favorites '
        }
        sql += 'FROM ('
            + 'SELECT tv.id '
            + 'FROM videos tv '
            + categoryJoin
            + whereClause + ' '
            + 'ORDER BY tv.upload_time DESC, tv.id DESC '
            + limitOffset
            + ') AS keys '
            + 'JOIN videos v ON v.id = keys.id '
            + 'INNER JOIN categories tc ON tc.id = v.category_id '
            + 'LEFT JOIN authors ta ON ta.id = v.author_id AND ta.category_id = v.category_id '
        if (userId) {
            sql += `LEFT JOIN favorites tf ON tf.target_id=v.id AND tf.target_type=${FAVORITES_TARGET_TYPE.VIDEO} `
        }
        sql += 'ORDER BY v.upload_time DESC, v.id DESC';
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },
    countForSearch: (isInside, title, categoryId, authorId, tagNames, status) => {
        let sql = 'SELECT COUNT(DISTINCT tv.id) as total FROM videos tv ';
        if (!categoryId) {
            sql += 'INNER JOIN categories tc ON tc.id = tv.category_id '
                + 'AND tc.type = ' + (isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL) + ' ';
        }
        const sqlConcat = [];
        const params = [];
        if (tagNames) {
            const tagList = Array.isArray(tagNames) ? tagNames : [tagNames];
            if (tagList.length > 0) {
                const placeholders = tagList.map(() => '?').join(',');
                sqlConcat.push(' tv.id IN ('
                    + 'SELECT vtm.video_id '
                    + 'FROM video_tag_map vtm '
                    + 'JOIN tags tt ON vtm.tag_id = tt.id '
                    + 'WHERE tt.name IN (' + placeholders + ') '
                    + 'GROUP BY vtm.video_id '
                    + 'HAVING COUNT(DISTINCT tt.id) = ?'
                    + ')');
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
        if (status) {
            sqlConcat.push(' tv.status = ?');
            params.push(status);
        }
        if (title) {
            sqlConcat.push(' tv.title LIKE ?');
            params.push('%' + title + '%');
        }
        if (sqlConcat.length > 0) {
            sql += ' WHERE ' + sqlConcat.join(' AND ');
        }
        return __sqliteDB.selectOne(sql, params, null, dbName).then(res => res?.total || 0);
    },
    countForCardView: (isInside) => {
        const sql = `SELECT COUNT(tv.id) AS count FROM videos tv `
            + `INNER JOIN categories tc ON tc.id = tv.category_id `
            + 'AND tc.type = ' + (isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL) + ' '
            + `WHERE tv.upload_time >= (unixepoch('now', '-1 day') * 1000)`
        return __sqliteDB.selectOne(sql, [], null, dbName).then(d => d?.count || 0)
    },
    selectForPlay: id => {
        const sql = `SELECT tv.id,tv.category_id,tv.author_id,tv.title,tv.upload_time,tc.name AS category,ta.name AS author `
            + `FROM videos tv `
            + `LEFT JOIN categories tc ON tv.category_id=tc.id `
            + `LEFT JOIN authors ta ON tv.author_id=ta.id `
            + `WHERE tv.id=?`;
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    }
}