const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectOneByName: category => {
        const sql = 'SELECT id, name FROM categories WHERE name=?'
        return __sqliteDB.selectOne(sql, [category], null, dbName)
    },
    selectOneById: id => {
        const sql = 'SELECT id, name FROM categories WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    insertOne: category => {
        const sql = 'INSERT INTO categories(name) VALUES(?)'
        return __sqliteDB.insert(sql, [category], null, dbName)
    },
    deleteOne: categoryId => {
        const sql = `DELETE FROM categories WHERE id=?`
        return __sqliteDB.delete(sql, [categoryId], null, dbName)
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