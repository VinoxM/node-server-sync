import { HybridLRUCache } from "../../../core/infra/extendMap.js"

const dbName = 'rss'
const enablePrint = { print: true }

const fontsMapCache = new HybridLRUCache(200)

const selectOneById = async id => {
    const sql = `SELECT id, title, minio_link FROM rss_fonts WHERE id=?`
    return __sqliteDB.selectOne(sql, [id], null, dbName)
}

export default {
    selectOneById,
    selectOneByTitle: async title => {
        const fontCache = fontsMapCache.get(title)
        if (fontCache) return fontCache
        const sql = `SELECT id, title, minio_link FROM rss_fonts WHERE title=?`
        const font = await __sqliteDB.selectOne(sql, [title], null, dbName)
        font && fontsMapCache.set(font.title, font)
        return font
    },
    selectByTitles: async titles => {
        const result = []
        const arr = []
        for (const title of titles) {
            const fontCache = fontsMapCache.get(title)
            if (fontCache) {
                result.push(fontCache)
            } else {
                arr.push(title)
            }
        }
        if (arr.length > 0) {
            const sql = `SELECT id, title, minio_link FROM rss_fonts WHERE title IN (${arr.map(() => '?').join(',')})`
            const { data: fonts } = await __sqliteDB.selectAll(sql, arr, null, dbName)
            if (__isNotEmptyArray(fonts)) {
                fonts.forEach(font => { fontsMapCache.set(font?.title, font); result.push(font) })
            }
        }
        return result
    },
    selectAll: () => {
        const sql = `SELECT id, title, minio_link FROM rss_fonts`
        return __sqliteDB.selectAll(sql, [], null, dbName).then(({ data }) => data)
    },
    insertOne: async (title, minioLink) => {
        const sql = `INSERT OR IGNORE INTO rss_fonts(title, minio_link) VALUES(?,?)`
        const { rows, lastId } = await __sqliteDB.insert(sql, [title, minioLink], null, dbName)
        if (rows > 0) {
            fontsMapCache.set(title, { id: lastId, title, minioLink })
        }
        return lastId
    },
    updateOne: async (id, title, minioLink) => {
        const font = await selectOneById(id)
        if (!font) return { rows: 0 }
        const { title: originTitle } = font
        const sql = `UPDATE rss_fonts SET title=?,minio_link=? WHERE id=?`
        const { rows } = await __sqliteDB.update(sql, [title, minioLink, id], null, dbName)
        if (rows > 0) {
            fontsMapCache.delete(originTitle)
            fontsMapCache.set(title, { id, title, minioLink })
        }
        return { rows }
    },
    deleteOne: async id => {
        const font = await selectOneById(id)
        if (!font) return { rows: 0 }
        const { title: originTitle } = font
        const sql = `DELETE FROM rss_fonts WHERE id=?`
        const { rows } = await __sqliteDB.delete(sql, [id], null, dbName)
        if (rows > 0) {
            fontsMapCache.delete(originTitle)
        }
        return { rows }
    },
}