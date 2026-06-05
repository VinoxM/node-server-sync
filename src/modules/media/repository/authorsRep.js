import { FAVORITES_TARGET_TYPE } from "../constants/favoritesConst.js";

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
        const authorInfo = await __sqliteDB.selectOne(sql, [author, categoryId], null, dbName)
        if (authorInfo) {
            const authors = authorCache.get(categoryId) ?? new Map()
            authors.set(author, authorInfo.id)
            authorCache.set(categoryId, authors)
        }
        return authorInfo
    },
    selectByNames: async (authors, categoryId) => {
        if (__isEmptyArray(authors)) return []
        const result = new Map()
        const params = []
        if (authorCache.has(categoryId)) {
            const categoryCache = authorCache.get(categoryId)
            authors.forEach(author => categoryCache?.has?.(author) ? result.set(author, { id: categoryCache.get(author), name: author }) : params.push(author))
        } else {
            params.push(...authors)
        }
        if (params.length > 0) {
            const sql = 'SELECT id, name FROM authors WHERE category_id=? AND name IN(' + params.map(() => '?').join(',') + ')'
            const { data } = await __sqliteDB.selectAll(sql, [categoryId, ...params], null, dbName)
            if (__isNotEmptyArray(data)) {
                const authors = authorCache.get(categoryId) ?? new Map()
                data.forEach(d => (result.set(d.name, d), authors.set(d.name, d.id)))
                authorCache.set(categoryId, authors)
            }
        }
        return Array.from(result.values())
    },
    selectOneById: id => {
        const sql = 'SELECT id, category_id, name FROM authors WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    insertOne: (author, categoryId) => {
        const sql = 'INSERT OR IGNORE INTO authors(category_id, name) VALUES(?,?)'
        return __sqliteDB.insert(sql, [categoryId, author], null, dbName)
    },
    selectAuthorsByLatestUpload: (categoryId, authorName) => {
        let sql = `SELECT ta.id, ta.name, MAX(tv.upload_time) AS last_time,COUNT(tv.id) AS count FROM authors ta `
            + `LEFT JOIN videos tv ON ta.id = tv.author_id `
            + `WHERE ta.category_id = ? `
        const params = [categoryId]
        if (__isNotBlank(authorName)) {
            sql += `AND ta.name LIKE ? `
            params.push(`%${authorName}%`)
        }
        sql += `GROUP BY ta.id `
            + `ORDER BY last_time DESC`;
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },
    selectAuthorsByLatestUploadWithFavorites: (categoryId, authorName, userId) => {
        let sql = `SELECT ta.id, ta.name, MAX(tv.upload_time) AS last_time,COUNT(tv.id) AS count, `
            + `MAX(tf.create_time) AS favorites_time `
            + `FROM authors ta `
            + `LEFT JOIN videos tv ON ta.id = tv.author_id `
            + `LEFT JOIN favorites tf ON tf.target_id = ta.id AND tf.target_type=? `
            + `WHERE ta.category_id = ? `
        const params = [FAVORITES_TARGET_TYPE.AUTHOR, categoryId]
        if (__isNotBlank(authorName)) {
            sql += `AND ta.name LIKE ? `
            params.push(`%${authorName}%`)
        }
        sql += `GROUP BY ta.id `
            + `ORDER BY favorites_time DESC, last_time DESC`;
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },
    selectVideosExistsByAuthorId: authorId => {
        const sql = `SELECT EXISTS(SELECT 1 FROM videos WHERE author_id = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [authorId], null, dbName).then(({ exists }) => exists)
    },
    deleteOne: async authorId => {
        const result = { rows: 0 }
        const author = await __sqliteDB.selectOne('SELECT id, category_id, name FROM authors WHERE id=?', [authorId], null, dbName)
        if (author) {
            const { categoryId, name } = author
            const sql = `DELETE FROM authors WHERE id=?`
            const res = await __sqliteDB.delete(sql, [authorId], null, dbName)
            if (res?.rows > 0) {
                const authors = authorCache.get(categoryId)
                authors?.delete?.(name)
                result.rows = res.rows
            }
        }
        return result
    }
}