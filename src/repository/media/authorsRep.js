const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectOneByName: (author, categoryId) => {
        const sql = 'SELECT id, name FROM authors WHERE name=? AND category_id=?'
        return sqliteDB.selectOne(sql, [author, categoryId], null, dbName)
    },
    selectOneById: id => {
        const sql = 'SELECT id, category_id, name FROM authors WHERE id=?'
        return sqliteDB.selectOne(sql, [id], null, dbName)
    },
    insertOne: (author, categoryId) => {
        const sql = 'INSERT INTO authors(category_id, name) VALUES(?,?)'
        return sqliteDB.insert(sql, [categoryId, author], null, dbName)
    },
    selectByCategoryId: categoryId => {
        const sql = 'SELECT id, category_id, name FROM authors WHERE category_id=?'
        return sqliteDB.selectAll(sql, [categoryId], null, dbName)
    }
}