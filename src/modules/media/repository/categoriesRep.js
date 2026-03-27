import { HybridLRUCache } from "../../../core/infra/extendMap.js"

const dbName = 'media'
const enablePrint = { print: true }

const nameCache = new HybridLRUCache()

export default {
    selectOneByName: async category => {
        if (nameCache.has(category)) {
            return { id: nameCache.get(category), name: category }
        }
        const sql = 'SELECT id, name FROM categories WHERE name=?'
        const categoryObj = await __sqliteDB.selectOne(sql, [category], null, dbName)
        categoryObj && nameCache.set(category, categoryObj.id);
        return categoryObj
    },
    selectOneById: id => {
        const sql = 'SELECT id, name FROM categories WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    insertOne: category => {
        const sql = 'INSERT INTO categories(name) VALUES(?)'
        return __sqliteDB.insert(sql, [category], null, dbName)
    },
    deleteOne: async categoryId => {
        const result = { rows: 0 }
        const category = await __sqliteDB.selectOne('SELECT id, name FROM categories WHERE id=?', [id], null, dbName)
        if (category) {
            const sql = `DELETE FROM categories WHERE id=?`
            const res = await __sqliteDB.delete(sql, [categoryId], null, dbName)
            if (res?.rows > 0) {
                nameCache.delete(category.name)
                result.rows = res.rows
            }
        }
        return result
    },
    selectAll: () => {
        const sql = 'SELECT id,name FROM categories'
        return __sqliteDB.selectAll(sql, [], null, dbName)
    },
    selectVideosExistsByCategoryId: categoryId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM videos WHERE category_id = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [categoryId], null, dbName).then(({ exists }) => exists)
    },
    selectAuthorsExistsByCategoryId: categoryId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM authors WHERE category_id = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [categoryId], null, dbName).then(({ exists }) => exists)
    },
    selectFilterRulesExistsByCategoryId: categoryId => {
        const sql = `SELECT NOT EXISTS (SELECT 1 FROM blacklist WHERE category_id = ?) AND NOT EXISTS (SELECT 1 FROM whitelist WHERE category_id = ?) AS clean;`
        return __sqliteDB.selectOne(sql, [categoryId, categoryId], null, dbName).then(({ clean }) => !clean)
    }
}