import { FAVORITES_TARGET_TYPE } from "../constants/favoritesConst.js"
import { MEDIA_CATEGORY_TYPE, MEDIA_VIDEO_MINIO_TYPE } from "../constants/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertOne: (userId, targetType, targetId) => {
        const sql = `INSERT OR IGNORE INTO favorites(user_id, target_type, target_id, create_time) VALUES(?,?,?,?)`
        const params = [userId, targetType, targetId, new Date()]
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    deleteOneById: id => {
        const sql = `DELETE FROM favorites WHERE id=?`
        return __sqliteDB.delete(sql, [id], null, dbName)
    },
    deleteOne: (userId, targetType, targetId) => {
        const sql = `DELETE FROM favorites WHERE user_id=? AND target_type=? AND target_id=?`
        const params = [userId, targetType, targetId]
        return __sqliteDB.delete(sql, params, null, dbName)
    },
    deleteByVideoId: (videoId) => {
        const sql =`DELETE FROM favorites WHERE target_type=? AND target_id=?`
        return __sqliteDB.delete(sql, [FAVORITES_TARGET_TYPE.VIDEO, videoId])
    },
    deleteByAuthorId: (authorId) => {
        const sql =`DELETE FROM favorites WHERE target_type=? AND target_id=?`
        return __sqliteDB.delete(sql, [FAVORITES_TARGET_TYPE.AUTHOR, authorId])
    },
    selectAuthorFavorites: (userId, isInside) => {
        const categoryType = isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL
        const sql = `SELECT tbf.id, tbc.id AS categoryId, tbc.name AS category, tba.id AS authorId, tba.name AS author, tbf.create_time `
            + `FROM favorites tbf `
            + `LEFT JOIN authors tba ON tba.id=tbf.target_id `
            + `LEFT JOIN categories tbc ON tbc.id=tba.category_id `
            + `WHERE tbf.user_id=? AND tbf.target_type=? AND tbc.type=? `
            + `ORDER BY tbf.id DESC`
        const params = [userId, FAVORITES_TARGET_TYPE.AUTHOR, categoryType]
        return __sqliteDB.selectAll(sql, params, null, dbName)
    },
    selectVideoFavorites: (userId, isInside) => {
        const categoryType = isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL
        const sql = `SELECT tf.id, tv.id AS videoId, tv.title, tv.category_id, tc.name AS category, tv.author_id, ta.name AS author, `
            + '(SELECT link FROM video_minio WHERE video_id = tv.id AND type = ' + MEDIA_VIDEO_MINIO_TYPE.COVER + ' LIMIT 1) AS cover, '
            + `tf.create_time `
            + `FROM favorites tf `
            + `LEFT JOIN videos tv ON tv.id=tf.target_id `
            + `LEFT JOIN categories tc ON tc.id=tv.category_id `
            + `LEFT JOIN authors ta ON ta.id=tv.author_id `
            + `WHERE tf.user_id=? AND tf.target_type=? AND tc.type=? `
            + `GROUP BY tf.id `
            + `ORDER BY tf.id DESC`
        return __sqliteDB.selectAll(sql, [userId, FAVORITES_TARGET_TYPE.VIDEO, categoryType], null, dbName)
    },
    checkFavorites: (userId, targetType, targetId) => {
        const sql = `SELECT id FROM favorites WHERE user_id=? AND target_type=? AND target_id=?`
        return __sqliteDB.selectOne(sql, [userId, targetType, targetId], null, dbName).then(data => data?.id)
    }
}