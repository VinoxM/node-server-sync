const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectOneByName: tag => {
        const sql = 'SELECT id, name FROM tags WHERE name=?'
        return __sqliteDB.selectOne(sql, [tag], null, dbName)
    },
    insertOne: tag => {
        const sql = 'INSERT INTO tags(name) VALUES(?)'
        return __sqliteDB.insert(sql, [tag], null, dbName)
    }
}