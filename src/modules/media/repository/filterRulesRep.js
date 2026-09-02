const dbName = 'media';
const enablePrint = { print: true };

/**
 * 规则操作表映射表
 */
export const OPERATOR_TABLE = {
    /** 白名单表 ('0' -> 'whitelist') */
    "0": "whitelist",
    /** 黑名单表 ('1' -> 'blacklist') */
    "1": "blacklist"
};

/**
 * 过滤类型键映射
 */
const FILTER_TYPE_KEY_MAPPING = {
    "1": 'author',
    "2": 'uniqueId'
};

/** @type {Map<number, { whitelist: { author: Set<string>, uniqueId: Set<string> }, blacklist: { author: Set<string>, uniqueId: Set<string> } }>} 过滤规则内存缓存 */
const filterRulesCache = new Map();

/**
 * 加载指定分类与操作类型的规则集合
 * @param {number} categoryId - 分类 ID
 * @param {string} operatorType - 规则类型 ('0' 白名单, '1' 黑名单)
 * @returns {Promise<{ author: Set<string>, uniqueId: Set<string> }>}
 */
async function loadCacheByCategoryId(categoryId, operatorType) {
    const result = {
        author: new Set(),
        uniqueId: new Set()
    };
    const operatorTable = OPERATOR_TABLE[operatorType];
    const filterRes = await __sqliteDB.selectAll(`SELECT type, value FROM ${operatorTable} WHERE category_id=?`, [categoryId], null, dbName);
    filterRes.rows > 0 && filterRes.data?.forEach(({ type, value }) => result[FILTER_TYPE_KEY_MAPPING[String(type)]]?.add(value));
    return result;
}

/**
 * 获取指定分类下的黑白名单规则缓存集合（自动懒加载）
 * @param {number} categoryId - 分类 ID
 * @returns {Promise<{ whitelist: { author: Set<string>, uniqueId: Set<string> }, blacklist: { author: Set<string>, uniqueId: Set<string> } }>}
 */
export async function getCacheByCategory(categoryId) {
    if (!filterRulesCache.has(categoryId)) {
        const whitelist = await loadCacheByCategoryId(categoryId, "0");
        const blacklist = await loadCacheByCategoryId(categoryId, "1");
        filterRulesCache.set(categoryId, { whitelist, blacklist });
    }
    return filterRulesCache.get(categoryId);
}

/**
 * 媒体黑白名单过滤规则数据访问仓库
 */
export default {
    /**
     * 插入一条过滤规则并同步更新内存缓存
     * @param {number} categoryId - 分类 ID
     * @param {number} type - 规则类型 (1: author, 2: uniqueId)
     * @param {string} value - 匹配值
     * @param {string} operator - 操作表 ('0': whitelist, '1': blacklist)
     * @returns {Promise<ExecResult>}
     */
    insertOne: async (categoryId, type, value, operator) => {
        const operatorTable = OPERATOR_TABLE[operator];
        const sql = `INSERT OR IGNORE INTO ${operatorTable}(category_id, type, value) VALUES(?,?,?)`;
        const params = [categoryId, type, value];
        const result = await __sqliteDB.insert(sql, params, null, dbName);
        if (result.rows > 0) {
            const cache = await getCacheByCategory(categoryId);
            cache[operatorTable][FILTER_TYPE_KEY_MAPPING[String(type)]]?.add(value);
        }
        return result;
    },

    /**
     * 删除一条过滤规则并同步从内存缓存中剔除
     * @param {number} categoryId - 分类 ID
     * @param {number} type - 规则类型
     * @param {string} value - 匹配值
     * @param {string} operator - 操作表
     * @returns {Promise<ExecResult>}
     */
    deleteOne: async (categoryId, type, value, operator) => {
        const operatorTable = OPERATOR_TABLE[operator];
        const sql = `DELETE FROM ${operatorTable} WHERE category_id=? AND type=? AND value=?`;
        const params = [categoryId, type, value];
        const result = await __sqliteDB.delete(sql, params, null, dbName);
        if (result.rows > 0) {
            const cache = await getCacheByCategory(categoryId);
            cache[operatorTable][FILTER_TYPE_KEY_MAPPING[String(type)]]?.delete(value);
        }
        return result;
    }
};