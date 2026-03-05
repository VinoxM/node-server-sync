const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertTags: (videoId, tagIds) => {
        if (isEmptyArray(tagIds)) {
            return Promise.resolve()
        }
        let sql = `INSERT INTO video_tag_map(video_id, tag_id) VALUES`
        const params = []
        sql += tagIds.map(tagId => {
            params.push(videoId, tagId)
            return `(?,?)`
        }).join(',')
        return sqliteDB.insert(sql, params, null, dbName)
    },
    deleteTags: (videoId) => {
        const sql = 'DELETE FROM video_tag_map WHERE video_id=?'
        return sqliteDB.delete(sql, [videoId], null, dbName)
    }
}