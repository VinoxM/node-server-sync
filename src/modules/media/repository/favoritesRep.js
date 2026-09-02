import { FAVORITES_TARGET_TYPE } from "../constants/favoritesConst.js";
import { MEDIA_CATEGORY_TYPE, MEDIA_VIDEO_MINIO_TYPE } from "../constants/mediaConst.js";

const dbName = 'media';
const enablePrint = { print: true };

/**
 * 媒体收藏 (作者/视频) 数据访问仓库
 */
export default {
    /**
     * 插入一条用户收藏记录 (已存在则忽略)
     * @param {number} userId - 用户 ID
     * @param {string} targetType - 目标类型 (FAVORITES_TARGET_TYPE)
     * @param {number} targetId - 目标主键 ID (创作者 ID 或 视频 ID)
     * @returns {Promise<ExecResult>}
     */
    insertOne: (userId, targetType, targetId) => {
        const sql = `INSERT OR IGNORE INTO favorites(user_id, target_type, target_id, create_time) VALUES(?,?,?,?)`;
        const params = [userId, targetType, targetId, new Date()];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 根据主键 ID 删除单条收藏
     * @param {number} id - 收藏主键 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOneById: id => {
        const sql = `DELETE FROM favorites WHERE id=?`;
        return __sqliteDB.delete(sql, [id], null, dbName);
    },

    /**
     * 根据用户、目标类型和目标 ID 取消收藏
     * @param {number} userId - 用户 ID
     * @param {string} targetType - 目标类型
     * @param {number} targetId - 目标 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOne: (userId, targetType, targetId) => {
        const sql = `DELETE FROM favorites WHERE user_id=? AND target_type=? AND target_id=?`;
        const params = [userId, targetType, targetId];
        return __sqliteDB.delete(sql, params, null, dbName);
    },

    /**
     * 删除指定视频的所有收藏关联记录
     * @param {number} videoId - 视频 ID
     * @returns {Promise<ExecResult>}
     */
    deleteByVideoId: (videoId) => {
        const sql = `DELETE FROM favorites WHERE target_type=? AND target_id=?`;
        return __sqliteDB.delete(sql, [FAVORITES_TARGET_TYPE.VIDEO, videoId], null, dbName);
    },

    /**
     * 删除指定创作者的所有收藏关联记录
     * @param {number} authorId - 创作者 ID
     * @param {any} [transactionDB] - 可选的事务连接
     * @returns {Promise<ExecResult>}
     */
    deleteByAuthorId: (authorId, transactionDB) => {
        const sql = `DELETE FROM favorites WHERE target_type=? AND target_id=?`;
        return (transactionDB || __sqliteDB).delete(sql, [FAVORITES_TARGET_TYPE.AUTHOR, authorId], null, dbName);
    },

    /**
     * 查询用户收藏的创作者列表
     * @param {number} userId - 用户 ID
     * @param {boolean} isInside - 是否包含/仅限内部私密分类
     * @returns {Promise<QueryResult<{ id: number, categoryId: number, category: string, authorId: number, author: string, createTime: string }>>}
     */
    selectAuthorFavorites: (userId, isInside) => {
        const categoryType = isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL;
        const sql = `SELECT tbf.id, tbc.id AS categoryId, tbc.name AS category, tbf.target_id AS authorId, tba.name AS author, tbf.create_time `
            + `FROM favorites tbf `
            + `LEFT JOIN authors tba ON tba.id=tbf.target_id `
            + `LEFT JOIN categories tbc ON tbc.id=tba.category_id `
            + `WHERE tbf.user_id=? AND tbf.target_type=? AND tbc.type=? `
            + `ORDER BY tbf.id DESC`;
        const params = [userId, FAVORITES_TARGET_TYPE.AUTHOR, categoryType];
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 查询用户收藏的视频列表 (包含封面链接与分类作者信息)
     * @param {number} userId - 用户 ID
     * @param {boolean} isInside - 是否内部私密分类
     * @returns {Promise<QueryResult<{ id: number, videoId: number, title: string, categoryId: number, category: string, authorId: number, author: string, cover: string, createTime: string }>>}
     */
    selectVideoFavorites: (userId, isInside) => {
        const categoryType = isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL;
        const sql = `SELECT tf.id, tf.target_id AS videoId, tv.title, tv.category_id, tc.name AS category, tv.author_id, ta.name AS author, `
            + '(SELECT link FROM video_minio WHERE video_id = tv.id AND type = ' + MEDIA_VIDEO_MINIO_TYPE.COVER + ' LIMIT 1) AS cover, '
            + `tf.create_time `
            + `FROM favorites tf `
            + `LEFT JOIN videos tv ON tv.id=tf.target_id `
            + `LEFT JOIN categories tc ON tc.id=tv.category_id `
            + `LEFT JOIN authors ta ON ta.id=tv.author_id `
            + `WHERE tf.user_id=? AND tf.target_type=? AND tc.type=? `
            + `GROUP BY tf.id `
            + `ORDER BY tf.id DESC`;
        return __sqliteDB.selectAll(sql, [userId, FAVORITES_TARGET_TYPE.VIDEO, categoryType], null, dbName);
    },

    /**
     * 检查用户是否已收藏指定目标
     * @param {number} userId - 用户 ID
     * @param {string} targetType - 目标类型
     * @param {number} targetId - 目标 ID
     * @returns {Promise<number|undefined>} 存在返回收藏记录主键 ID，否则为 undefined
     */
    checkFavorites: async (userId, targetType, targetId) => {
        const sql = `SELECT id FROM favorites WHERE user_id=? AND target_type=? AND target_id=?`;
        return __sqliteDB.selectOne(sql, [userId, targetType, targetId], null, dbName).then(data => data?.id);
    }
};