import {
    MEDIA_CATEGORY_TYPE, MEDIA_MINIO_STATUS,
    MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_MINIO_TYPE,
    MEDIA_VIDEO_STATUS
} from "../constants/mediaConst.js";
import { HybridLRUCache } from "#core/infra/extendMap.js";
import { FAVORITES_TARGET_TYPE } from "../constants/favoritesConst.js";

const dbName = 'media';
const enablePrint = { print: true };

/** @type {HybridLRUCache} 视频查重缓存 */
const existsCache = new HybridLRUCache(1000);
const existsTtl = 1000 * 60 * 6;

/**
 * 构造查重缓存键
 * @param {number} categoryId - 分类 ID
 * @param {number|null} [authorId] - 创作者 ID
 * @param {string|null} [uniqueId] - 唯一标识
 * @returns {string}
 */
function generateExistsKey(categoryId, authorId, uniqueId) {
    return `${categoryId}::${authorId || 'null'}::${uniqueId || 'null'}`;
}

/**
 * 清理指定维度下的所有查重缓存
 * @param {number} categoryId - 分类 ID
 * @param {number|null} [authorId] - 创作者 ID
 * @param {string|null} [uniqueId] - 唯一标识
 */
function clearExistsCache(categoryId, authorId, uniqueId) {
    existsCache.delete(generateExistsKey(categoryId, authorId, uniqueId));
    existsCache.delete(generateExistsKey(categoryId, authorId, null));
    existsCache.delete(generateExistsKey(categoryId, null, uniqueId));
    existsCache.delete(generateExistsKey(categoryId, null, null));
}

/**
 * 解析并安全转换时间
 * @param {any} time - 时间对象或字符串
 * @returns {Date}
 */
function tryResolveTime(time) {
    try {
        return new Date(time);
    } catch (ignored) {
        return new Date();
    }
}

/**
 * 媒体视频主表数据访问仓库
 */
export default {
    /**
     * 检查视频是否已存在（带短时 LRU 缓存加速）
     * @param {number} categoryId - 分类 ID
     * @param {number} [authorId] - 可选创作者 ID
     * @param {string} [uniqueId] - 可选唯一标识
     * @returns {Promise<boolean>}
     */
    selectForExists: async (categoryId, authorId, uniqueId) => {
        const existsKey = generateExistsKey(categoryId, authorId, uniqueId);
        if (existsCache.has(existsKey)) {
            return existsCache.get(existsKey);
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
        const exists = await __sqliteDB.selectOne(sql, params, null, dbName).then(res => !!res?.result);
        existsCache.set(existsKey, exists, existsTtl);
        return exists;
    },

    /**
     * 根据 uniqueId 数组与分类 ID 批量查询视频记录
     * @param {string[]} uniqueIds - 唯一标识列表
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<QueryResult<{ id: number, authorId: number, authorName: string, uniqueId: string }>>}
     */
    selectByUniqueIds: async (uniqueIds, categoryId) => {
        const sql = 'SELECT v.id,v.author_id,a.name AS authorName,v.unique_id FROM videos v'
            + ' LEFT JOIN authors a ON a.id=v.author_id '
            + ' WHERE v.category_id=? AND v.unique_id IN (' + new Array(uniqueIds.length).fill('?').join(',') + ')';
        return __sqliteDB.selectAll(sql, [categoryId, ...uniqueIds], null, dbName);
    },

    /**
     * 插入一条新的视频记录
     * @param {Object} video - 视频数据对象
     * @param {string} video.uniqueId - 唯一标识
     * @param {string} video.title - 视频标题
     * @param {number} video.categoryId - 分类 ID
     * @param {number} video.authorId - 创作者 ID
     * @param {any} video.uploadTime - 视频发布时间
     * @param {number} video.status - 初始状态
     * @returns {Promise<ExecResult>}
     */
    insertOne: async video => {
        const sql = 'INSERT INTO videos(unique_id, title, category_id, author_id, upload_time, status, create_time) VALUES(?,?,?,?,?,?,?)';
        const params = [video.uniqueId, video.title, video.categoryId, video.authorId, tryResolveTime(video.uploadTime), video.status, new Date()];
        const res = await __sqliteDB.insert(sql, params, null, dbName);
        res.rows > 0 && clearExistsCache(video.categoryId, video.authorId, video.uniqueId);
        return res;
    },

    /**
     * 根据资源类型动态更新 videos 表中对应的 minio 关联列 (如 cover_id, source_id, barrage_id)
     * @param {number} videoId - 视频 ID
     * @param {number} minioId - video_minio 主键 ID
     * @param {number} type - 资源类型
     * @returns {Promise<ExecResult>}
     */
    updateMinioIdById: (videoId, minioId, type) => {
        const columnName = MEDIA_TYPE_DESCRIPTION[type] + '_id';
        const sql = `UPDATE videos SET ${columnName}=? WHERE id=?`;
        return __sqliteDB.update(sql, [minioId, videoId], null, dbName);
    },

    /**
     * 根据 video_minio 的完成情况自动推导并更新视频的综合状态 status
     * @param {number} videoId - 视频 ID
     * @returns {Promise<number>} 更新后的新状态值
     */
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
        return __sqliteDB.selectOne(sql, [videoId], null, dbName).then(data => data?.status);
    },

    /**
     * 将视频标记为已移除 (REMOVED)
     * @param {number} videoId - 视频 ID
     * @returns {Promise<ExecResult>}
     */
    updateVideoRemoved: videoId => {
        const sql = `UPDATE videos SET status=${MEDIA_VIDEO_STATUS.REMOVED} WHERE id=?`;
        return __sqliteDB.update(sql, [videoId], null, dbName);
    },

    /**
     * 修改视频标题
     * @param {number} videoId - 视频 ID
     * @param {string} title - 新标题
     * @returns {Promise<ExecResult>}
     */
    updateVideoTitle: (videoId, title) => {
        const sql = 'UPDATE videos SET title=? WHERE id=?';
        const params = [title, videoId];
        return __sqliteDB.update(sql, params, null, dbName);
    },

    /**
     * 根据视频 ID 查询单个视频详情
     * @param {number} videoId - 视频 ID
     * @param {boolean} [ignoreRemoved=false] - 是否排除已删除的视频
     * @returns {Promise<{ id: number, uniqueId: string, title: string, authorId: number, categoryId: number, uploadTime: string, status: number, createTime: string, totalSize: string }|null>}
     */
    selectOne: async (videoId, ignoreRemoved = false) => {
        let sql = 'SELECT id, unique_id, title, author_id, category_id, upload_time, status, create_time, total_size FROM videos WHERE id=?';
        if (ignoreRemoved) {
            sql += ` AND status!=${MEDIA_VIDEO_STATUS.REMOVED}`;
        }
        return __sqliteDB.selectOne(sql, [videoId], null, dbName);
    },

    /**
     * 物理删除视频记录并清理查重缓存
     * @param {number} videoId - 视频 ID
     * @returns {Promise<{ rows: number }>}
     */
    deleteOne: async videoId => {
        const result = { rows: 0 };
        const video = await __sqliteDB.selectOne('SELECT unique_id, author_id, category_id FROM videos WHERE id=?', [videoId], null, dbName);
        if (video) {
            const sql = 'DELETE FROM videos WHERE id=?';
            const res = await __sqliteDB.delete(sql, [videoId], null, dbName);
            res.rows > 0 && clearExistsCache(video.categoryId, video.authorId, video.uniqueId);
            result.rows = res.rows;
        }
        return result;
    },

    /**
     * 更新视频总存储大小 (total_size)
     * @param {number} videoId - 视频 ID
     * @param {string|number} totalSize - 字节大小
     * @returns {Promise<ExecResult>}
     */
    updateTotalSize: (videoId, totalSize) => {
        const sql = `UPDATE videos SET total_size=? WHERE id=?`;
        return __sqliteDB.update(sql, [totalSize, videoId], null, dbName);
    },

    /**
     * 多条件复合检索视频列表（支持分类、UP主、标题、标签多选、状态、排序与收藏态）
     * @param {boolean} isInside - 是否内部私密分类
     * @param {string} [title] - 标题模糊匹配
     * @param {number} [categoryId] - 分类 ID
     * @param {number} [authorId] - 创作者 ID
     * @param {string|string[]} [tagNames] - 标签名称或列表
     * @param {number} [status] - 状态筛选
     * @param {number} [pageNum] - 当前页码
     * @param {number} [pageSize] - 每页条数
     * @param {boolean} [needTotalSize=false] - 是否返回存储大小字段
     * @param {number} [userId] - 当前登录用户 ID（用于计算收藏状态）
     * @param {{ type?: 'totalSize'|'uploadTime', asc?: boolean }} [orderBy] - 排序配置
     * @returns {Promise<QueryResult<{ id: number, uniqueId: string, title: string, authorId: number, categoryId: number, uploadTime: string, status: number, createTime: string, totalSize?: string, category: string, author: string, cover: string, favorites?: number }>>}
     */
    selectForSearch: (isInside, title, categoryId, authorId, tagNames, status, pageNum, pageSize, needTotalSize = false, userId, orderBy) => {
        function searchOrderBy(tbName, needTotalSize, orderBy) {
            if (needTotalSize && orderBy?.type === 'totalSize') {
                return `ORDER BY ${tbName}.total_size ` + (orderBy?.asc ? 'ASC' : 'DESC');
            } else {
                return `ORDER BY ${tbName}.upload_time ` + (orderBy?.asc ? 'ASC' : 'DESC');
            }
        }
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
            sql += 'v.total_size, ';
        }
        sql += 'tc.name AS category, '
            + 'ta.name AS author, '
            + '(SELECT link FROM video_minio WHERE video_id = v.id AND type = ' + MEDIA_VIDEO_MINIO_TYPE.COVER + ' LIMIT 1) AS cover ';
        if (userId) {
            sql += ', CASE WHEN tf.id IS NULL THEN 0 ELSE 1 END AS favorites ';
        }
        sql += 'FROM ('
            + 'SELECT tv.id '
            + 'FROM videos tv '
            + categoryJoin
            + whereClause + ' '
            + searchOrderBy('tv', needTotalSize, orderBy)
            + ' '
            + limitOffset
            + ') AS keys '
            + 'JOIN videos v ON v.id = keys.id '
            + 'INNER JOIN categories tc ON tc.id = v.category_id '
            + 'LEFT JOIN authors ta ON ta.id = v.author_id AND ta.category_id = v.category_id ';
        if (userId) {
            sql += `LEFT JOIN favorites tf ON tf.target_id=v.id AND tf.target_type=${FAVORITES_TARGET_TYPE.VIDEO} `;
        }
        sql += searchOrderBy('v', needTotalSize, orderBy);
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 统计符合检索条件的视频总数
     * @param {boolean} isInside - 是否内部私密分类
     * @param {string} [title] - 标题模糊匹配
     * @param {number} [categoryId] - 分类 ID
     * @param {number} [authorId] - 创作者 ID
     * @param {string|string[]} [tagNames] - 标签过滤
     * @param {number} [status] - 状态筛选
     * @returns {Promise<number>}
     */
    countForSearch: async (isInside, title, categoryId, authorId, tagNames, status) => {
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

    /**
     * 统计 24 小时内更新的视频数量 (用于卡片视图角标提示)
     * @param {boolean} isInside - 是否内部私密分类
     * @returns {Promise<number>}
     */
    countForCardView: async (isInside) => {
        const sql = `SELECT COUNT(tv.id) AS count FROM videos tv `
            + `INNER JOIN categories tc ON tc.id = tv.category_id `
            + 'AND tc.type = ' + (isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL) + ' '
            + `WHERE tv.upload_time >= (unixepoch('now', '-1 day') * 1000)`;
        return __sqliteDB.selectOne(sql, [], null, dbName).then(d => d?.count || 0);
    },

    /**
     * 查询单个视频的播放基础元信息 (包含分类名称与创作者名称)
     * @param {number} id - 视频 ID
     * @returns {Promise<{ id: number, categoryId: number, authorId: number, title: string, uploadTime: string, category: string, author: string }|null>}
     */
    selectForPlay: id => {
        const sql = `SELECT tv.id,tv.category_id,tv.author_id,tv.title,tv.upload_time,tc.name AS category,ta.name AS author `
            + `FROM videos tv `
            + `LEFT JOIN categories tc ON tv.category_id=tc.id `
            + `LEFT JOIN authors ta ON tv.author_id=ta.id `
            + `WHERE tv.id=?`;
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 根据创作者 ID 查询其名下的全部视频 ID 列表
     * @param {number} authorId - 创作者 ID
     * @returns {Promise<QueryResult<{ id: number }>>}
     */
    selectAllByAuthor: authorId => {
        const sql = `SELECT id FROM videos WHERE author_id=?`;
        return __sqliteDB.selectAll(sql, [authorId], null, dbName);
    }
};