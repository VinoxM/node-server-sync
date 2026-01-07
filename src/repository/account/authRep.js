const dbName = 'account'

const enablePrint = { print: true }

export default {
    userExists: (uname) => {
        const sql = `SELECT COUNT(uname) AS count FROM auth_user WHERE uname = ?`
        return sqliteDB.selectOne(sql, [uname], null, dbName).then(res => res.count === 1)
    },
    selectByUname: (uname) => {
        const sql = `SELECT id, uname, password FROM auth_user WHERE uname = ?`
        return sqliteDB.selectOne(sql, [uname], null, dbName)
    },
    selectByUnameAndPassword: (uname, password) => {
        const sql = `SELECT id, uname FROM auth_user WHERE uname = ? AND password = ?`
        return sqliteDB.selectOne(sql, [uname, password], null, dbName)
    },
    insertOne: (uname, password) => {
        if (isAnyBlank(uname, password)) {
            return Promise.resolve(0)
        }
        const sql = 'INSERT OR IGNORE INTO auth_user (uname, password, update_time, create_time) ' +
            'VALUES (?,?,?,?)'
        const createTime = new Date()
        const params = [uname, password, createTime, createTime]
        return sqliteDB.insert(sql, params, null, dbName).then(res => res.rows)
    },
    updatePasswordByUname: (uname, password) => {
        if (isAnyBlank(uname, password)) {
            return Promise.resolve(0)
        }
        const sql = 'UPDATE auth_user SET password = ?, update_time = ? WHERE uname = ?'
        const params = [password, new Date(), uname]
        return sqliteDB.update(sql, params, enablePrint, dbName).then(res => res.rows)
    }
}