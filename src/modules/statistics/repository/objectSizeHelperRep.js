export default {
    selectUnprocessed: (dbName, tableName, linkColumn, sizeColumn, matchers, lastId, limit) => {
        let sql = `SELECT id, ${linkColumn} AS link FROM ${tableName} WHERE `
        const concat = [`id > ?`, `${sizeColumn} IS NULL`]
        if (__isNotEmptyArray(matchers)) {
            concat.push(...matchers)
        }
        sql += concat.join(' AND ')
        sql += ` ORDER BY id LIMIT ? `
        return __sqliteDB.selectAll(sql, [lastId, limit], null, dbName);
    },
    selectProcessed: (dbName, tableName, linkColumn, sizeColumn, matchers, lastId, limit) => {
        let sql = `SELECT id, ${linkColumn} AS link, ${sizeColumn} AS size FROM ${tableName} WHERE `
        const concat = [`id > ?`, `${sizeColumn} IS NOT NULL `]
        if (__isNotEmptyArray(matchers)) {
            concat.push(...matchers)
        }
        sql += concat.join(' AND ')
        sql += ` ORDER BY id LIMIT ? `
        return __sqliteDB.selectAll(sql, [lastId, limit], null, dbName);
    },
    updateObjectSizeById: (dbName, tableName, sizeColumn, size, id) => {
        const sql = `UPDATE ${tableName} SET ${sizeColumn}=? WHERE id=?`
        return __sqliteDB.update(sql, [size, id], null, dbName)
    }
}
