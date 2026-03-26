const dbName = 'media'
const enablePrint = { print: true }

export default {
    insertTags: (videoId, tagIds) => {
        if (__isEmptyArray(tagIds)) {
            return Promise.resolve()
        }
        let sql = `INSERT OR IGNORE INTO video_tag_map(video_id, tag_id) VALUES`
        const params = []
        sql += tagIds.map(tagId => {
            params.push(videoId, tagId)
            return `(?,?)`
        }).join(',')
        return __sqliteDB.insert(sql, params, null, dbName)
    },
    deleteTags: (videoId) => {
        const sql = 'DELETE FROM video_tag_map WHERE video_id=?'
        return __sqliteDB.delete(sql, [videoId], null, dbName)
    },
    deleteTagsWithId: (videoId, tagIds) => {
        if (__isEmptyArray(tagIds)) {
            return Promise.resolve()
        }
        let sql = 'DELETE FROM video_tag_map WHERE video_id=? AND tag_id IN ('
        sql += tagIds.map(() => '?').join(',') + ')'
        return __sqliteDB.delete(sql, [videoId, ...tagIds], null, dbName)
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
        return __sqliteDB.selectAll(sql, params, null, dbName);
    },
    deleteDirtyVideoTagMapping: async () => {
        let toRemoveVideoIds = []
        const sql = `SELECT DISTINCT video_id FROM video_tag_map vt WHERE NOT EXISTS (SELECT 1 FROM videos WHERE videos.id = vt.video_id)`
        const { data, rows } = await __sqliteDB.selectAll(sql, [], null, dbName);
        if (rows > 0) {
            toRemoveVideoIds = data.map(o => o.videoId)
            const delSql = 'DELETE FROM video_tag_map WHERE video_id IN ('
                + toRemoveVideoIds.map(() => '?').join(',') + ')'
            await __sqliteDB.delete(delSql, toRemoveVideoIds, null, dbName);
        }
        return toRemoveVideoIds
    },
}