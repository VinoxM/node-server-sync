const dbName = 'media'
const enablePrint = { print: true }

export const OPERATOR_TABLE = {
    "0": "whitelist",
    "1": "blacklist"
}

const FILTER_TYPE_KEY_MAPPING = {
    "1": 'author',
    "2": 'uniqueId'
}

const filterRulesCache = new Map()

async function loadCacheByCategoryId(categoryId, operatorType) {
    const result = {
        author: new Set(),
        uniqueId: new Set()
    }
    const operatorTable = OPERATOR_TABLE[operatorType]
    const filterRes = await __sqliteDB.selectAll(`SELECT type, value FROM ${operatorTable} WHERE category_id=?`, [categoryId], null, dbName)
    filterRes.rows > 0 && filterRes.data?.forEach(({ type, value }) => result[FILTER_TYPE_KEY_MAPPING[String(type)]]?.add(value))
    return result
}

export async function getCacheByCategory(categoryId) {
    if (!filterRulesCache.has(categoryId)) {
        const whitelist = await loadCacheByCategoryId(categoryId, "0")
        const blacklist = await loadCacheByCategoryId(categoryId, "1")
        filterRulesCache.set(categoryId, { whitelist, blacklist })
    }
    return filterRulesCache.get(categoryId)
}

export default {
    insertOne: async (categoryId, type, value, operator) => {
        const operatorTable = OPERATOR_TABLE[operator]
        const sql = `INSERT OR IGNORE INTO ${operatorTable}(category_id, type, value) VALUES(?,?,?)`
        const params = [categoryId, type, value]
        const result = await __sqliteDB.insert(sql, params, null, dbName)
        if (result.rows > 0) {
            const cache = await getCacheByCategory(categoryId)
            cache[operatorTable][FILTER_TYPE_KEY_MAPPING[String(type)]]?.add(value)
        }
        return result
    },
    deleteOne: async (categoryId, type, value, operator) => {
        const operatorTable = OPERATOR_TABLE[operator]
        const sql = `DELETE FROM ${operatorTable} WHERE category_id=? AND type=? AND value=?`
        const params = [categoryId, type, value]
        const result = await __sqliteDB.delete(sql, params, null, dbName)
        if (result.rows > 0) {
            const cache = await getCacheByCategory(categoryId)
            cache[operatorTable][FILTER_TYPE_KEY_MAPPING[String(type)]]?.delete(value)
        }
        return result
    },
}