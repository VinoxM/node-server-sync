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
        const sql = 'INSERT OR IGNORE INTO authors(category_id, name) VALUES(?,?)'
        return sqliteDB.insert(sql, [categoryId, author], null, dbName)
    },
    selectByCategoryId: categoryId => {
        const sql = 'SELECT id, category_id, name FROM authors WHERE category_id=?'
        return sqliteDB.selectAll(sql, [categoryId], null, dbName)
    },
    selectAuthorsByLatestUpload: (categoryId) => {
        const sql = `SELECT ta.id, ta.name, MAX(tv.upload_time) AS last_time,COUNT(tv.id) AS count FROM authors ta `
            + `LEFT JOIN videos tv ON ta.id = tv.author_id `
            + `WHERE ta.category_id = ? `
            + `GROUP BY ta.id `
            + `ORDER BY last_time DESC`;
        return sqliteDB.selectAll(sql, [categoryId], null, dbName);
    },
    selectVideosExistsByAuthorId: authorId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM videos WHERE author_id = ? LIMIT 1) AS [exists]`
        return sqliteDB.selectOne(sql, [authorId], null, dbName).then(({ exists }) => exists)
    },
    deleteOne: authorId => {
        const sql = `DELETE FROM authors WHERE id=?`
        return sqliteDB.delete(sql, [authorId], null, dbName)
    }
}