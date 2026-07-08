import { MEDIA_CATEGORY_TYPE, MEDIA_VIDEO_STATUS } from "../constants/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    // playlists
    selectForSearch: (categoryId, title, pageNum, pageSize, isInside = false) => {
        const params = []
        const whereConcat = []
        if (categoryId) {
            whereConcat.push(`p.category_id=? `)
            params.push(categoryId)
        }
        if (__isNotBlank(title)) {
            whereConcat.push(`p.title LIKE ? `)
            params.push(`%${title}%`)
        }
        const whereSql = whereConcat.length > 0 ? `WHERE ` + whereConcat.join('AND ') : ''
        let limitOffset = '';
        if (pageNum !== undefined && pageSize !== undefined) {
            const offset = (pageNum - 1) * pageSize;
            limitOffset = ' LIMIT ' + pageSize + ' OFFSET ' + offset;
        }
        const sql = `SELECT p.id, p.category_id, tc.name AS categoryName, p.title `
            + `FROM playlists p `
            + `INNER JOIN categories tc ON tc.id=p.category_id AND tc.type=${isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL} `
            + whereSql
            + limitOffset
        return __sqliteDB.selectAll(sql, params, null, dbName)
    },
    selectCountForSearch: (categoryId, title, isInside = false) => {
        const params = []
        const whereConcat = []
        if (categoryId) {
            whereConcat.push(`p.category_id=? `)
            params.push(categoryId)
        }
        if (__isNotBlank(title)) {
            whereConcat.push(`p.title LIKE ? `)
            params.push(`%${title}%`)
        }
        const whereSql = whereConcat.length > 0 ? `WHERE ` + whereConcat.join('AND ') : ''
        const sql = `SELECT COUNT(p.id) AS count `
            + `FROM playlists p `
            + `INNER JOIN categories tc ON tc.id=p.category_id AND tc.type=${isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL} `
            + whereSql
        return __sqliteDB.selectOne(sql, params, null, dbName).then(data => data?.count ?? 0);
    },
    selectOneById: (id) => {
        const sql = `SELECT id, category_id, title FROM playlists WHERE id=?`
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    selectOneByTitleAndCategory: (title, categoryId) => {
        const sql = `SELECT id, category_id, title FROM playlists WHERE title=? AND category_id=?`
        return __sqliteDB.selectOne(sql, [title, categoryId], null, dbName)
    },
    insertOne: (categoryId, title) => {
        const sql = `INSERT INTO playlists(category_id, title, create_time) VALUES(?,?,?)`
        const params = [categoryId, title, new Date()]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    insertOneNotIgnoreByTitle: (categoryId, title) => {
        const sql = `INSERT INTO playlists (category_id, title, create_time) `
            + `SELECT ?, ?, ? `
            + `WHERE NOT EXISTS (`
            + `SELECT 1 FROM playlists WHERE title = ? AND category_id = ?`
            + `)`;
        const params = [categoryId, title, new Date(), title, categoryId]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    updateTitle: (id, title) => {
        const sql = `UPDATE playlists SET title=? WHERE id=?`
        return __sqliteDB.update(sql, [title, id], null, dbName)
    },
    deleteOne: (id) => {
        const sql = `DELETE FROM playlists WHERE id=?`
        return __sqliteDB.delete(sql, [id], null, dbName)
    },
    // playlist videos
    selectByVideoId: (videoId) => {
        const sql = `SELECT pv.playlist_id, p.category_id, p.title FROM playlist_videos pv `
            + `INNER JOIN playlists p ON p.id=pv.playlist_id `
            + `WHERE pv.video_id=?`
        return __sqliteDB.selectAll(sql, [videoId], null, dbName)
    },
    selectPlaylistById: (id) => {
        const sql = `SELECT pv.id, pv.playlist_id, pv.video_id, v.title, vm.link AS cover, v.category_id, tc.name AS categoryName, v.author_id, v.status, tv.name AS authorName, pv.sort `
            + `FROM playlist_videos pv `
            + `LEFT JOIN videos v ON v.id=pv.video_id `
            + `LEFT JOIN categories tc ON tc.id=v.category_id `
            + `LEFT JOIN authors tv ON tv.id=v.author_id `
            + `LEFT JOIN video_minio vm ON vm.id=v.cover_id `
            + `WHERE pv.playlist_id=? `
            + `ORDER BY pv.sort`
        return __sqliteDB.selectAll(sql, [id], null, dbName)
    },
    selectPlaylistPlayableVideosById: (id) => {
        const sql = `SELECT pv.video_id AS id, v.title, vm.link AS cover, v.category_id, tc.name AS categoryName, v.author_id, tv.name AS authorName, pv.sort `
            + `FROM playlist_videos pv `
            + `INNER JOIN videos v ON v.id=pv.video_id AND v.status=${MEDIA_VIDEO_STATUS.COMPLETE} `
            + `INNER JOIN categories tc ON tc.id=v.category_id `
            + `INNER JOIN authors tv ON tv.id=v.author_id `
            + `LEFT JOIN video_minio vm ON vm.id=v.cover_id `
            + `WHERE pv.playlist_id=? `
            + `ORDER BY pv.sort`
        return __sqliteDB.selectAll(sql, [id], null, dbName)
    },
    selectMaxSortedByPlaylistId: (playlistId) => {
        const sql = `SELECT MAX(sort) AS sort FROM playlist_videos WHERE playlist_id=?`
        return __sqliteDB.selectOne(sql, [playlistId], null, dbName).then(data => data?.sort ?? 0)
    },
    insertVideo: (playlistId, videoId, sort = 0) => {
        const sql = `INSERT OR IGNORE INTO playlist_videos(playlist_id, video_id, sort) VALUES(?,?,?)`
        return __sqliteDB.insert(sql, [playlistId, videoId, sort], null, dbName)
    },
    updateVideoSort: (playlistId, videoId, sort = 0) => {
        const sql = `UPDATE playlist_videos SET sort=? WHERE playlist_id=? AND video_id=?`
        return __sqliteDB.update(sql, [sort, playlistId, videoId], null, dbName)
    },
    deleteVideo: (playlistId, videoId) => {
        const sql = `DELETE FROM playlist_videos WHERE playlist_id=? AND video_id=?`
        return __sqliteDB.delete(sql, [playlistId, videoId], null, dbName)
    },
    deleteVideos: (playlistId, videoIds = []) => {
        const sql = `DELETE FROM playlist_videos WHERE playlist_id=? AND video_id IN (${videoIds.map(() => '?').join(',')})`
        return __sqliteDB.delete(sql, [playlistId, ...videoIds], null, dbName)
    },
    deleteByPlaylistId: (playlistId) => {
        const sql = `DELETE FROM playlist_videos WHERE playlist_id=?`
        return __sqliteDB.delete(sql, [playlistId], null, dbName)
    },
    deleteByVideoId: (videoId) => {
        const sql = `DELETE FROM playlist_videos WHERE video_id=?`
        return __sqliteDB.delete(sql, [videoId], null, dbName)
    },
    updateSortsByIds: (arr = []) => {
        return __sqliteDB.getTransactionDB(async db => {
            for (const data of arr) {
                if (data && data.id > 0 && Number.isInteger(data.sort)) {
                    const { id, sort } = data
                    await db.update(`UPDATE playlist_videos SET sort=? WHERE id=?`, [sort, id])
                }
            }
        }, null, dbName)
    }
}