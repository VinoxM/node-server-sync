import { FAVORITES_TARGET_TYPE } from "../constants/favoritesConst.js";

const dbName = 'media';
const enablePrint = { print: true };

/** @type {Map<number, Map<string, number>>} 创作者内存缓存 (categoryId -> (authorName -> authorId)) */
const authorCache = new Map();

/**
 * 媒体创作者/UP 主数据访问仓库
 */
export default {
    /**
     * 根据分类 ID 与创作者名称查询单条作者记录（优先读取本地内存缓存）
     * @param {string} author - 创作者名称
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<{ id: number, name: string }|null>}
     */
    selectOneByName: async (author, categoryId) => {
        if (authorCache.has(categoryId) && authorCache.get(categoryId)?.has?.(author)) {
            const id = authorCache.get(categoryId)?.get(author);
            return { id, name: author };
        }
        const sql = 'SELECT id, name FROM authors WHERE name=? AND category_id=?';
        const authorInfo = await __sqliteDB.selectOne(sql, [author, categoryId], null, dbName);
        if (authorInfo) {
            const authors = authorCache.get(categoryId) ?? new Map();
            authors.set(author, authorInfo.id);
            authorCache.set(categoryId, authors);
        }
        return authorInfo;
    },

    /**
     * 根据作者名字数组与分类 ID 批量查询并回填缓存
     * @param {string[]} authors - 创作者名称数组
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<Array<{ id: number, name: string }>>}
     */
    selectByNames: async (authors, categoryId) => {
        if (__isEmptyArray(authors)) return [];
        const result = new Map();
        const params = [];
        if (authorCache.has(categoryId)) {
            const categoryCache = authorCache.get(categoryId);
            authors.forEach(author => categoryCache?.has?.(author) ? result.set(author, { id: categoryCache.get(author), name: author }) : params.push(author));
        } else {
            params.push(...authors);
        }
        if (params.length > 0) {
            const sql = 'SELECT id, name FROM authors WHERE category_id=? AND name IN(' + params.map(() => '?').join(',') + ')';
            const { data } = await __sqliteDB.selectAll(sql, [categoryId, ...params], null, dbName);
            if (__isNotEmptyArray(data)) {
                const authors = authorCache.get(categoryId) ?? new Map();
                data.forEach(d => (result.set(d.name, d), authors.set(d.name, d.id)));
                authorCache.set(categoryId, authors);
            }
        }
        return Array.from(result.values());
    },

    /**
     * 根据主键 ID 查询创作者
     * @param {number} id - 作者 ID
     * @returns {Promise<{ id: number, categoryId: number, name: string }|null>}
     */
    selectOneById: id => {
        const sql = 'SELECT id, category_id, name FROM authors WHERE id=?';
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },

    /**
     * 插入创作者记录（已存在同名且同分类则跳过）
     * @param {string} author - 创作者名称
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<ExecResult>}
     */
    insertOne: (author, categoryId) => {
        const sql = 'INSERT OR IGNORE INTO authors(category_id, name) VALUES(?,?)';
        return __sqliteDB.insert(sql, [categoryId, author], null, dbName);
    },

    /**
     * 按最新视频上传时间倒序查询指定分类下的创作者列表及视频总数
     * @param {number} categoryId - 分类 ID
     * @param {string} [authorName] - 可选的名称模糊搜索
     * @returns {Promise<QueryResult<{ id: number, name: string, lastTime: string, count: number }>>}
     */
    selectAuthorsByLatestUpload: (categoryId, authorName) => {
        let sql = `SELECT ta.id, ta.name, MAX(tv.upload_time) AS last_time,COUNT(tv.id) AS count FROM authors ta `
            + `LEFT JOIN videos tv ON ta.id = tv.author_id `
            + `WHERE ta.category_id = ? `;
        const params = [categoryId];
        if (__isNotBlank(authorName)) {
            sql += `AND ta.name LIKE ? `;
            params.push(`%${authorName}%`);
        }
        sql += `GROUP BY ta.id `
            + `ORDER BY last_time DESC`;
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 按用户收藏优先与视频最新上传时间倒序查询创作者列表
     * @param {number} categoryId - 分类 ID
     * @param {string} [authorName] - 创作者名称关键字
     * @param {number} userId - 用户 ID
     * @returns {Promise<QueryResult<{ id: number, name: string, lastTime: string, count: number, favoritesTime: string }>>}
     */
    selectAuthorsByLatestUploadWithFavorites: (categoryId, authorName, userId) => {
        let sql = `SELECT ta.id, ta.name, MAX(tv.upload_time) AS last_time,COUNT(tv.id) AS count, `
            + `MAX(tf.create_time) AS favorites_time `
            + `FROM authors ta `
            + `LEFT JOIN videos tv ON ta.id = tv.author_id `
            + `LEFT JOIN favorites tf ON tf.target_id = ta.id AND tf.target_type=? `
            + `WHERE ta.category_id = ? `;
        const params = [FAVORITES_TARGET_TYPE.AUTHOR, categoryId];
        if (__isNotBlank(authorName)) {
            sql += `AND ta.name LIKE ? `;
            params.push(`%${authorName}%`);
        }
        sql += `GROUP BY ta.id `
            + `ORDER BY favorites_time DESC, last_time DESC`;
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },

    /**
     * 检查指定创作者下是否包含任意视频
     * @param {number} authorId - 作者 ID
     * @returns {Promise<number>} 1 表示存在，0 表示不存在
     */
    selectVideosExistsByAuthorId: async authorId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM videos WHERE author_id = ? LIMIT 1) AS [exists]`;
        return __sqliteDB.selectOne(sql, [authorId], null, dbName).then(res => res?.exists ?? 0);
    },

    /**
     * 删除指定的创作者并清理其内存缓存
     * @param {number} authorId - 创作者 ID
     * @param {any} [transactionDB] - 可选的事务连接
     * @returns {Promise<{ rows: number }>}
     */
    deleteOne: async (authorId, transactionDB) => {
        const db = (transactionDB || __sqliteDB);
        const result = { rows: 0 };
        const author = await db.selectOne('SELECT id, category_id, name FROM authors WHERE id=?', [authorId], null, dbName);
        if (author) {
            const { categoryId, name } = author;
            const sql = `DELETE FROM authors WHERE id=?`;
            const res = await db.delete(sql, [authorId], null, dbName);
            if (res?.rows > 0) {
                const authors = authorCache.get(categoryId);
                authors?.delete?.(name);
                result.rows = res.rows;
            }
        }
        return result;
    },

    /**
     * 查询指定分类下没有任何视频关联的空创作者 ID 列表
     * @param {number} categoryId - 分类 ID
     * @param {any} [transactionDB] - 事务连接
     * @returns {Promise<QueryResult<{ id: number }>>}
     */
    selectEmptyVideoAuthors: (categoryId, transactionDB) => {
        const sql = `SELECT a.id FROM authors a `
            + `WHERE a.category_id = ? `
            + `AND NOT EXISTS (`
            + `SELECT 1 FROM videos v `
            + `WHERE v.author_id = a.id `
            + `AND v.category_id = a.category_id`
            + `)`;
        return (transactionDB || __sqliteDB).selectAll(sql, [categoryId], null, dbName);
    }
};