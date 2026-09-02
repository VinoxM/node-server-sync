import { HybridLRUCache } from "#core/infra/extendMap.js";
import { MEDIA_CATEGORY_TYPE } from "../constants/mediaConst.js";

const dbName = 'media';
const enablePrint = { print: true };

/** @type {HybridLRUCache} 分类名称缓存 (name -> categoryObj) */
const nameCache = new HybridLRUCache();
/** @type {HybridLRUCache} 分类 ID 缓存 (id -> categoryObj) */
const idCache = new HybridLRUCache();

/**
 * 媒体分类数据访问仓库
 */
export default {
    /**
     * 根据分类名称查询分类（带 LRU 缓存）
     * @param {string} category - 分类名称
     * @returns {Promise<{ id: number, name: string, type: number }|null>}
     */
    selectOneByName: async category => {
        if (nameCache.has(category)) {
            return nameCache.get(category);
        }
        const sql = 'SELECT id, name, type FROM categories WHERE name=?';
        const categoryObj = await __sqliteDB.selectOne(sql, [category], null, dbName);
        categoryObj && nameCache.set(category, categoryObj);
        return categoryObj;
    },

    /**
     * 根据分类 ID 查询分类（带 LRU 缓存）
     * @param {number} id - 分类 ID
     * @returns {Promise<{ id: number, name: string, type: number }|null>}
     */
    selectOneById: async id => {
        if (idCache.has(id)) {
            const { name, type } = idCache.get(id);
            return { id, name, type };
        }
        const sql = 'SELECT id, name, type FROM categories WHERE id=?';
        const categoryObj = await __sqliteDB.selectOne(sql, [id], null, dbName);
        categoryObj && idCache.set(id, categoryObj);
        return categoryObj;
    },

    /**
     * 插入一个新分类
     * @param {string} category - 分类名称
     * @param {number} inside - 是否为内部私密分类 (MEDIA_CATEGORY_TYPE)
     * @returns {Promise<ExecResult>}
     */
    insertOne: (category, inside) => {
        const sql = 'INSERT INTO categories(name, type) VALUES(?, ?)';
        return __sqliteDB.insert(sql, [category, inside], null, dbName);
    },

    /**
     * 删除指定分类并清理 LRU 缓存
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<{ rows: number }>}
     */
    deleteOne: async categoryId => {
        const result = { rows: 0 };
        const category = await __sqliteDB.selectOne('SELECT id, name FROM categories WHERE id=?', [categoryId], null, dbName);
        if (category) {
            const sql = `DELETE FROM categories WHERE id=?`;
            const res = await __sqliteDB.delete(sql, [categoryId], null, dbName);
            if (res?.rows > 0) {
                nameCache.delete(category.name);
                idCache.delete(categoryId);
                result.rows = res.rows;
            }
        }
        return result;
    },

    /**
     * 根据是否为内部私密分类查询分类列表
     * @param {boolean} isInside - 是否包含/属于内部私密分类
     * @returns {Promise<QueryResult<{ id: number, name: string, type: number }>>}
     */
    selectByInside: (isInside) => {
        const sql = 'SELECT id,name,type FROM categories WHERE type=' + (isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL);
        return __sqliteDB.selectAll(sql, [], null, dbName);
    },

    /**
     * 检查指定分类下是否存在视频数据
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<number>}
     */
    selectVideosExistsByCategoryId: async categoryId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM videos WHERE category_id = ? LIMIT 1) AS [exists]`;
        return __sqliteDB.selectOne(sql, [categoryId], null, dbName).then(res => res?.exists ?? 0);
    },

    /**
     * 检查指定分类下是否存在创作者数据
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<number>}
     */
    selectAuthorsExistsByCategoryId: async categoryId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM authors WHERE category_id = ? LIMIT 1) AS [exists]`;
        return __sqliteDB.selectOne(sql, [categoryId], null, dbName).then(res => res?.exists ?? 0);
    },

    /**
     * 检查指定分类下是否存在黑名单/白名单过滤规则
     * @param {number} categoryId - 分类 ID
     * @returns {Promise<boolean>} 存在规则返回 true，否则返回 false
     */
    selectFilterRulesExistsByCategoryId: async categoryId => {
        const sql = `SELECT NOT EXISTS (SELECT 1 FROM blacklist WHERE category_id = ?) AND NOT EXISTS (SELECT 1 FROM whitelist WHERE category_id = ?) AS clean;`;
        return __sqliteDB.selectOne(sql, [categoryId, categoryId], null, dbName).then(res => !res?.clean);
    }
};