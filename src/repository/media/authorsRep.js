const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectOneByName: author => {
        const sql = 'SELECT id, name FROM authors WHERE name=?'
        return sqliteDB.selectOne(sql, [author], null, dbName)
    },
    selectOneById: id => {
        const sql = 'SELECT id, name FROM authors WHERE id=?'
        return sqliteDB.selectOne(sql, [id], null, dbName)
    },
    insertOne: author => {
        const sql = 'INSERT INTO authors(name) VALUES(?)'
        return sqliteDB.insert(sql, [author], null, dbName)
    }
}