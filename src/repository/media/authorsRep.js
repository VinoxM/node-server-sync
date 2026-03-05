const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectOneByName: author => {
        const sql = 'SELECT id, name FROM authors WHERE name=?'
        return sqliteDB.selectOne(sql, [author], null, dbName)
    },
    insertOne: author => {
        const sql = 'INSERT INTO authors(name) VALUES(?)'
        return sqliteDB.insert(sql, [author], null, dbName)
    }
}