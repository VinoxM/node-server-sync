const dbName = 'media'
const enablePrint = { print: true }

const authorCache = new Map();

export default {
    selectOneByName: async (author, categoryId) => {
        if (authorCache.has(categoryId) && authorCache.get(categoryId).has?.(author)) {
            const id = authorCache.get(categoryId).get(author)
            return { id, name: author }
        }
        const sql = 'SELECT id, name FROM authors WHERE name=? AND category_id=?'
        const authorInfo = await sqliteDB.selectOne(sql, [author, categoryId], null, dbName)
        if (authorInfo) {
            const authors = authorCache.get(categoryId) ?? new Map()
            authors.set(author, authorInfo.id)
            authorCache.set(categoryId, authors)
        }
        return authorInfo
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
    selectAuthorsByLatestUpload: (categoryId, authorName) => {
        let sql = `SELECT ta.id, ta.name, MAX(tv.upload_time) AS last_time,COUNT(tv.id) AS count FROM authors ta `
            + `LEFT JOIN videos tv ON ta.id = tv.author_id `
            + `WHERE ta.category_id = ? `
        const params = [categoryId]
        if (isNotBlank(authorName)) {
            sql += `AND ta.name LIKE ? `
            params.push(`%${authorName}%`)
        }
        sql += `GROUP BY ta.id `
            + `ORDER BY last_time DESC`;
        return sqliteDB.selectAll(sql, params, null, dbName);
    },
    selectVideosExistsByAuthorId: authorId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM videos WHERE author_id = ? LIMIT 1) AS [exists]`
        return sqliteDB.selectOne(sql, [authorId], null, dbName).then(({ exists }) => exists)
    },
    deleteOne: async authorId => {
        const result = { rows: 0 }
        const author = await sqliteDB.selectOne('SELECT id, category_id, name FROM authors WHERE id=?', [authorId], null, dbName)
        if (author) {
            const { categoryId, name } = author
            const sql = `DELETE FROM authors WHERE id=?`
            const res = await sqliteDB.delete(sql, [authorId], null, dbName)
            if (res?.rows > 0) {
                const authors = authorCache.get(categoryId)
                authors?.delete?.(name)
                result.rows = res.rows
            }
        }
        return result
    }
}