const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertTags: (videoId, tagIds) => {
        if (isEmptyArray(tagIds)) {
            return Promise.resolve()
        }
        let sql = `INSERT OR IGNORE INTO video_tag_map(video_id, tag_id) VALUES`
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
    },
    deleteTagsWithId: (videoId, tagIds) => {
        if (isEmptyArray(tagIds)) {
            return Promise.resolve()
        }
        let sql = 'DELETE FROM video_tag_map WHERE video_id=? AND tag_id IN ('
        sql += tagIds.map(() => '?').join(',') + ')'
        return sqliteDB.delete(sql, [videoId, ...tagIds], null, dbName)
    },
    selectTagsWithCount: (categoryId, videoId = null) => {
        let sql = `SELECT t.id,t.name, COUNT(v.id) as usage_count `
            + `FROM tags t `
            + `INNER JOIN video_tag_map vtm ON t.id = vtm.tag_id `
            + `INNER JOIN videos v ON vtm.video_id = v.id `
            + `WHERE v.category_id = ?`;
        const params = [categoryId];
        if (videoId) {
            sql += ` AND t.id IN (SELECT tag_id FROM video_tag_map WHERE video_id = ?)`;
            params.push(videoId);
        }
        sql += ` GROUP BY t.id, t.name`;
        sql += ` ORDER BY usage_count DESC, t.name ASC`;
        return sqliteDB.selectAll(sql, params, null, dbName);
    }
}