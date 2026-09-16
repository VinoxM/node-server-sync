import { HybridLRUCache } from "#core/infra/extendMap.js";

const dbName = 'anime';

/** 字体信息内存高速 LRU 缓存 (容量 200) */
const fontsMapCache = new HybridLRUCache(200);

const selectOneById = async id => {
    const sql = `SELECT id, title, minio_link FROM rss_fonts WHERE id=?`;
    return __sqliteDB.selectOne(sql, [id], null, dbName);
};

/**
 * ASS 字幕内嵌字体持久化仓储服务
 */
export default {
    /**
     * 根据主键 ID 查询字体记录
     * @param {number} id - 字体 ID
     * @returns {Promise<{ id: number, title: string, minioLink: string }|null>}
     */
    selectOneById,

    /**
     * 根据字体名称/标题查询字体记录（优先从内存缓存获取）
     * @param {string} title - 字体名称
     * @returns {Promise<{ id: number, title: string, minioLink: string }|null>}
     */
    selectOneByTitle: async title => {
        const fontCache = fontsMapCache.get(title);
        if (fontCache) return fontCache;
        const sql = `SELECT id, title, minio_link FROM rss_fonts WHERE title=?`;
        const font = await __sqliteDB.selectOne(sql, [title], null, dbName);
        font && fontsMapCache.set(font.title, font);
        return font;
    },

    /**
     * 根据字体名称列表批量查询字体记录
     * @param {string[]} titles - 字体名称列表
     * @returns {Promise<Array<{ id: number, title: string, minioLink: string }>>}
     */
    selectByTitles: async titles => {
        const result = [];
        const arr = [];
        for (const title of titles) {
            const fontCache = fontsMapCache.get(title);
            if (fontCache) {
                result.push(fontCache);
            } else {
                arr.push(title);
            }
        }
        if (arr.length > 0) {
            const sql = `SELECT id, title, minio_link FROM rss_fonts WHERE title IN (${arr.map(() => '?').join(',')})`;
            const { data: fonts } = await __sqliteDB.selectAll(sql, arr, null, dbName);
            if (__isNotEmptyArray(fonts)) {
                fonts.forEach(font => { fontsMapCache.set(font?.title, font); result.push(font); });
            }
        }
        return result;
    },

    /**
     * 查询所有已录入的字体列表
     * @returns {Promise<Array<{ id: number, title: string, minioLink: string }>>}
     */
    selectAll: async () => {
        const sql = `SELECT id, title, minio_link FROM rss_fonts`;
        return __sqliteDB.selectAll(sql, [], null, dbName).then(({ data }) => data);
    },

    /**
     * 插入单条字体记录
     * @param {string} title - 字体名称
     * @param {string} minioLink - 对象存储链接
     * @returns {Promise<number|undefined>} 插入成功返回主键 ID
     */
    insertOne: async (title, minioLink) => {
        const sql = `INSERT OR IGNORE INTO rss_fonts(title, minio_link) VALUES(?,?)`;
        const { rows, lastId } = await __sqliteDB.insert(sql, [title, minioLink], null, dbName);
        if (rows > 0) {
            fontsMapCache.set(title, { id: lastId, title, minioLink });
        }
        return lastId;
    },

    /**
     * 更新字体信息
     * @param {number} id - 字体 ID
     * @param {string} title - 新字体名称
     * @param {string} minioLink - 新存储链接
     * @returns {Promise<{ rows: number }>}
     */
    updateOne: async (id, title, minioLink) => {
        const font = await selectOneById(id);
        if (!font) return { rows: 0 };
        const { title: originTitle } = font;
        const sql = `UPDATE rss_fonts SET title=?,minio_link=? WHERE id=?`;
        const { rows } = await __sqliteDB.update(sql, [title, minioLink, id], null, dbName);
        if (rows > 0) {
            fontsMapCache.delete(originTitle);
            fontsMapCache.set(title, { id, title, minioLink });
        }
        return { rows };
    },

    /**
     * 根据主键 ID 删除字体记录并同步清除内存缓存
     * @param {number} id - 字体 ID
     * @returns {Promise<{ rows: number }>}
     */
    deleteOne: async id => {
        const font = await selectOneById(id);
        if (!font) return { rows: 0 };
        const { title: originTitle } = font;
        const sql = `DELETE FROM rss_fonts WHERE id=?`;
        const { rows } = await __sqliteDB.delete(sql, [id], null, dbName);
        if (rows > 0) {
            fontsMapCache.delete(originTitle);
        }
        return { rows };
    }
};