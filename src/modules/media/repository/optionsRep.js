const dbName = 'media'
const enablePrint = { print: true }

export default {
    selectAll: () => {
        const sql = `SELECT id,label, description,value,update_time FROM options`
        return __sqliteDB.selectAll(sql, [], null, dbName)
    },
    updateById: (id, value, description) => {
        const sql = `UPDATE options SET value=?,description=?,update_time=? WHERE id=?`
        return __sqliteDB.update(sql, [value, description, new Date(), id], null, dbName)
    },
    updateByLabel: (label, value, description) => {
        const sql = `UPDATE options SET value=?,description=?,update_time=? WHERE label=?`
        return __sqliteDB.update(sql, [value, description, new Date(), label], null, dbName)
    },
    insertOne: (label, description, value) => {
        const sql = `INSERT OR IGNORE INTO options(label, description, value, update_time) VALUES(?,?,?,?)`
        return __sqliteDB.insert(sql, [label, description, value, new Date()], null, dbName)
    },
    selectByLabel: (label) => {
        const sql = `SELECT id,label,description,value,update_time FROM options WHERE label=?`
        return __sqliteDB.selectOne(sql, [label], null, dbName)
    },
    selectById: (id) => {
        const sql = `SELECT id,label,description,value,update_time FROM options WHERE id=?`
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    }
}