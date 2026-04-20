import { HybridLRUCache } from "../../../core/infra/extendMap.js"
import { MEDIA_CATEGORY_TYPE } from "../constants/mediaConst.js"

const dbName = 'media'
const enablePrint = { print: true }

const nameCache = new HybridLRUCache()
const idCache = new HybridLRUCache()

export default {
    selectOneByName: async category => {
        if (nameCache.has(category)) {
            return nameCache.get(category)
        }
        const sql = 'SELECT id, name, type FROM categories WHERE name=?'
        const categoryObj = await __sqliteDB.selectOne(sql, [category], null, dbName)
        categoryObj && nameCache.set(category, categoryObj);
        return categoryObj
    },
    selectOneById: async id => {
        if (idCache.has(id)) {
            const { name, type } = idCache.get(id)
            return { id, name, type }
        }
        const sql = 'SELECT id, name, type FROM categories WHERE id=?'
        const categoryObj = await __sqliteDB.selectOne(sql, [id], null, dbName)
        categoryObj && idCache.set(id, categoryObj);
        return categoryObj
    },
    insertOne: (category, inside) => {
        const sql = 'INSERT INTO categories(name, type) VALUES(?, ?)'
        return __sqliteDB.insert(sql, [category, inside], null, dbName)
    },
    deleteOne: async categoryId => {
        const result = { rows: 0 }
        const category = await __sqliteDB.selectOne('SELECT id, name FROM categories WHERE id=?', [categoryId], null, dbName)
        if (category) {
            const sql = `DELETE FROM categories WHERE id=?`
            const res = await __sqliteDB.delete(sql, [categoryId], null, dbName)
            if (res?.rows > 0) {
                nameCache.delete(category.name)
                idCache.delete(categoryId)
                result.rows = res.rows
            }
        }
        return result
    },
    selectByInside: (isInside) => {
        const sql = 'SELECT id,name,type FROM categories WHERE type=' + (isInside ? MEDIA_CATEGORY_TYPE.INSIDE : MEDIA_CATEGORY_TYPE.NORMAL)
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