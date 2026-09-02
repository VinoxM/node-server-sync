import { MEDIA_CATEGORY_TYPE, MEDIA_VIDEO_STATUS } from "../constants/mediaConst.js";

const dbName = 'media';
const enablePrint = { print: true };

/**
 * 媒体播单 (Playlists) 及播单关联视频数据访问仓库
 */
export default {
    /**
     * 分页多条件检索播单列表
     * @param {number} [categoryId] - 可选的分类 ID
     * @param {string} [title] - 可选的播单标题关键字
     * @param {number} [pageNum] - 当前页码 (从 1 开始)
     * @param {number} [pageSize] - 每页条数
     * @param {boolean} [isInside=false] - 是否包含/仅限内部私密分类
     * @returns {Promise<QueryResult<{ id: number, categoryId: number, categoryName: string, title: string }>>}
     */
    selectForSearch: (categoryId, title, pageNum, pageSize, isInside = false) => {
        const params = [];
        const whereConcat = [];
        if (categoryId) {
            whereConcat.push(`p.category_id=? `);
            params.push(categoryId);
        }
        if (__isNotBlank(title)) {
            whereConcat.push(`p.title LIKE ? `);
            params.push(`%${title}%`);
        }
        const whereSql = whereConcat.length > 0 ? `WHERE ` + whereConcat.join('AND ') : '';
        let limitOffset = '';
        if (pageNum !== undefined && pageSize !== undefined) {
            const offset = (pageNum - 1) * pageSize;
            limitOffset = ' LIMIT ' + pageSize + ' OFFSET ' + offset;
        }
        const sql = `SELECT p.id, p.category_id, tc.name AS categoryName, p.title `
            + `FROM playlists p `
            + `INNER JOIN categories tc ON tc.id=p.category_id AND tc.type=${isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL} `
            + whereSql
            + limitOffset;
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 查询符合检索条件的播单总条数
     * @param {number} [categoryId] - 分类 ID
     * @param {string} [title] - 标题模糊匹配
     * @param {boolean} [isInside=false] - 是否内部私密分类
     * @returns {Promise<number>}
     */
    selectCountForSearch: async (categoryId, title, isInside = false) => {
        const params = [];
        const whereConcat = [];
        if (categoryId) {
            whereConcat.push(`p.category_id=? `);
            params.push(categoryId);
        }
        if (__isNotBlank(title)) {
            whereConcat.push(`p.title LIKE ? `);
            params.push(`%${title}%`);
        }
        const whereSql = whereConcat.length > 0 ? `WHERE ` + whereConcat.join('AND ') : '';
        const sql = `SELECT COUNT(p.id) AS count `
            + `FROM playlists p `
            + `INNER JOIN categories tc ON tc.id=p.category_id AND tc.type=${isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL} `
            + whereSql;
        return __sqliteDB.selectOne(sql, params, null, dbName).then(data => data?.count ?? 0);
    },

    /**
     * 根据播单 ID 查询详情
     * @param {number} id - 播单 ID
     * @returns {Promise<{ id: number, categoryId: number, title: string }|null>}
     */
    selectOneById: (id) => {
        const sql = `SELECT id, category_id, title FROM playlists WHERE id=?`;
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 根据播单标题与分类 ID 查询单条记录
     * @param {string} title - 播单标题
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<{ id: number, categoryId: number, title: string }|null>}
     */
    selectOneByTitleAndCategory: (title, categoryId) => {
        const sql = `SELECT id, category_id, title FROM playlists WHERE title=? AND category_id=?`;
        return __sqliteDB.selectOne(sql, [title, categoryId], null, dbName);
    },

    /**
     * 插入一条新的播单记录
     * @param {number} categoryId - 分类 ID
     * @param {string} title - 播单标题
     * @returns {Promise<ExecResult>}
     */
    insertOne: (categoryId, title) => {
        const sql = `INSERT INTO playlists(category_id, title, create_time) VALUES(?,?,?)`;
        const params = [categoryId, title, new Date()];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 插入播单（若同名同分类已存在则忽略）
     * @param {number} categoryId - 分类 ID
     * @param {string} title - 播单标题
     * @returns {Promise<ExecResult>}
     */
    insertOneNotIgnoreByTitle: (categoryId, title) => {
        const sql = `INSERT INTO playlists (category_id, title, create_time) `
            + `SELECT ?, ?, ? `
            + `WHERE NOT EXISTS (`
            + `SELECT 1 FROM playlists WHERE title = ? AND category_id = ?`
            + `)`;
        const params = [categoryId, title, new Date(), title, categoryId];
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 修改播单标题
     * @param {number} id - 播单 ID
     * @param {string} title - 新标题
     * @returns {Promise<ExecResult>}
     */
    updateTitle: (id, title) => {
        const sql = `UPDATE playlists SET title=? WHERE id=?`;
        return __sqliteDB.update(sql, [title, id], null, dbName);
    },

    /**
     * 删除指定的播单记录
     * @param {number} id - 播单 ID
     * @returns {Promise<ExecResult>}
     */
    deleteOne: (id) => {
        const sql = `DELETE FROM playlists WHERE id=?`;
        return __sqliteDB.delete(sql, [id], null, dbName);
    },

    // ================= 播单关联视频 (playlist_videos) =================

    /**
     * 根据视频 ID 查询所属的全部播单信息列表
     * @param {number} videoId - 视频 ID
     * @returns {Promise<QueryResult<{ playlistId: number, categoryId: number, title: string }>>}
     */
    selectByVideoId: (videoId) => {
        const sql = `SELECT pv.playlist_id, p.category_id, p.title FROM playlist_videos pv `
            + `INNER JOIN playlists p ON p.id=pv.playlist_id `
            + `WHERE pv.video_id=?`;
        return __sqliteDB.selectAll(sql, [videoId], null, dbName);
    },

    /**
     * 根据播单 ID 查询其下的全量关联视频明细（包含封面、作者、排序号与状态）
     * @param {number} id - 播单 ID
     * @returns {Promise<QueryResult<{ id: number, playlistId: number, videoId: number, title: string, cover: string, categoryId: number, categoryName: string, authorId: number, status: number, authorName: string, sort: number }>>}
     */
    selectPlaylistById: (id) => {
        const sql = `SELECT pv.id, pv.playlist_id, pv.video_id, v.title, vm.link AS cover, v.category_id, tc.name AS categoryName, v.author_id, v.status, tv.name AS authorName, pv.sort `
            + `FROM playlist_videos pv `
            + `LEFT JOIN videos v ON v.id=pv.video_id `
            + `LEFT JOIN categories tc ON tc.id=v.category_id `
            + `LEFT JOIN authors tv ON tv.id=v.author_id `
            + `LEFT JOIN video_minio vm ON vm.id=v.cover_id `
            + `WHERE pv.playlist_id=? `
            + `ORDER BY pv.sort`;
        return __sqliteDB.selectAll(sql, [id], null, dbName);
    },

    /**
     * 根据播单 ID 查询仅限可播放状态 (COMPLETE) 的视频列表
     * @param {number} id - 播单 ID
     * @returns {Promise<QueryResult<{ id: number, title: string, cover: string, categoryId: number, categoryName: string, authorId: number, authorName: string, sort: number }>>}
     */
    selectPlaylistPlayableVideosById: (id) => {
        const sql = `SELECT pv.video_id AS id, v.title, vm.link AS cover, v.category_id, tc.name AS categoryName, v.author_id, tv.name AS authorName, pv.sort `
            + `FROM playlist_videos pv `
            + `INNER JOIN videos v ON v.id=pv.video_id AND v.status=${MEDIA_VIDEO_STATUS.COMPLETE} `
            + `INNER JOIN categories tc ON tc.id=v.category_id `
            + `INNER JOIN authors tv ON tv.id=v.author_id `
            + `LEFT JOIN video_minio vm ON vm.id=v.cover_id `
            + `WHERE pv.playlist_id=? `
            + `ORDER BY pv.sort`;
        return __sqliteDB.selectAll(sql, [id], null, dbName);
    },

    /**
     * 查询指定播单当前最大的排序号 sort
     * @param {number} playlistId - 播单 ID
     * @returns {Promise<number>}
     */
    selectMaxSortedByPlaylistId: (playlistId) => {
        const sql = `SELECT MAX(sort) AS sort FROM playlist_videos WHERE playlist_id=?`;
        return __sqliteDB.selectOne(sql, [playlistId], null, dbName).then(data => data?.sort ?? 0);
    },

    /**
     * 向播单添加一个视频条目
     * @param {number} playlistId - 播单 ID
     * @param {number} videoId - 视频 ID
     * @param {number} [sort=0] - 排序权重
     * @returns {Promise<ExecResult>}
     */
    insertVideo: (playlistId, videoId, sort = 0) => {
        const sql = `INSERT OR IGNORE INTO playlist_videos(playlist_id, video_id, sort) VALUES(?,?,?)`;
        return __sqliteDB.insert(sql, [playlistId, videoId, sort], null, dbName);
    },

    /**
     * 更新播单内某个视频的排序权重
     * @param {number} playlistId - 播单 ID
     * @param {number} videoId - 视频 ID
     * @param {number} [sort=0] - 目标排序值
     * @returns {Promise<ExecResult>}
     */
    updateVideoSort: (playlistId, videoId, sort = 0) => {
        const sql = `UPDATE playlist_videos SET sort=? WHERE playlist_id=? AND video_id=?`;
        return __sqliteDB.update(sql, [sort, playlistId, videoId], null, dbName);
    },

    /**
     * 从播单中移除指定视频
     * @param {number} playlistId - 播单 ID
     * @param {number} videoId - 视频 ID
     * @returns {Promise<ExecResult>}
     */
    deleteVideo: (playlistId, videoId) => {
        const sql = `DELETE FROM playlist_videos WHERE playlist_id=? AND video_id=?`;
        return __sqliteDB.delete(sql, [playlistId, videoId], null, dbName);
    },

    /**
     * 从播单中批量移除多个视频
     * @param {number} playlistId - 播单 ID
     * @param {number[]} [videoIds=[]] - 视频 ID 数组
     * @returns {Promise<ExecResult>}
     */
    deleteVideos: (playlistId, videoIds = []) => {
        const sql = `DELETE FROM playlist_videos WHERE playlist_id=? AND video_id IN (${videoIds.map(() => '?').join(',')})`;
        return __sqliteDB.delete(sql, [playlistId, ...videoIds], null, dbName);
    },

    /**
     * 根据播单 ID 清空其下的所有关联视频记录
     * @param {number} playlistId - 播单 ID
     * @returns {Promise<ExecResult>}
     */
    deleteByPlaylistId: (playlistId) => {
        const sql = `DELETE FROM playlist_videos WHERE playlist_id=?`;
        return __sqliteDB.delete(sql, [playlistId], null, dbName);
    },

    /**
     * 根据视频 ID 从所有播单中级联删除关联关系
     * @param {number} videoId - 视频 ID
     * @returns {Promise<ExecResult>}
     */
    deleteByVideoId: (videoId) => {
        const sql = `DELETE FROM playlist_videos WHERE video_id=?`;
        return __sqliteDB.delete(sql, [videoId], null, dbName);
    },

    /**
     * 事务内批量更新播单关联视频的排序序号
     * @param {Array<{ id: number, sort: number }>} [arr=[]] - 包含关联主键 id 与目标 sort 的对象数组
     * @returns {Promise<void>}
     */
    updateSortsByIds: (arr = []) => {
        return __sqliteDB.getTransactionDB(async db => {
            for (const data of arr) {
                if (data && data.id > 0 && Number.isInteger(data.sort)) {
                    const { id, sort } = data;
                    await db.update(`UPDATE playlist_videos SET sort=? WHERE id=?`, [sort, id]);
                }
            }
        }, null, dbName);
    }
};