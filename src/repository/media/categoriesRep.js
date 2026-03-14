const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectOneByName: category => {
        const sql = 'SELECT id, name FROM categories WHERE name=?'
        return sqliteDB.selectOne(sql, [category], null, dbName)
    },
    selectOneById: id => {
        const sql = 'SELECT id, name FROM categories WHERE id=?'
        return sqliteDB.selectOne(sql, [id], null, dbName)
    },
    insertOne: category => {
        const sql = 'INSERT INTO categories(name) VALUES(?)'
        return sqliteDB.insert(sql, [category], null, dbName)
    },
    selectAll: () => {
        const sql = 'SELECT id,name FROM categories'
        return sqliteDB.selectAll(sql, [], null, dbName)
    }
}