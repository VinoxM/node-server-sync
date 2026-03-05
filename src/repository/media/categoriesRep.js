const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectOneByName: category => {
        const sql = 'SELECT id, name FROM categories WHERE name=?'
        return sqliteDB.selectOne(sql, [category], null, dbName)
    },
    insertOne: category => {
        const sql = 'INSERT INTO categories(name) VALUES(?)'
        return sqliteDB.insert(sql, [category], null, dbName)
    }
}