const dbName = 'media';
const enablePrint = { print: true };

/**
 * 视频与标签多对多关联关系数据访问仓库
 */
export default {
    /**
     * 批量关联视频与标签（忽略已存在的关联）
     * @param {number} videoId - 视频 ID
     * @param {number[]} tagIds - 标签 ID 数组
     * @returns {Promise<ExecResult|void>}
     */
    insertTags: (videoId, tagIds) => {
        if (__isEmptyArray(tagIds)) {
            return Promise.resolve();
        }
        let sql = `INSERT OR IGNORE INTO video_tag_map(video_id, tag_id) VALUES`;
        const params = [];
        sql += tagIds.map(tagId => {
            params.push(videoId, tagId);
            return `(?,?)`;
        }).join(',');
        return __sqliteDB.insert(sql, params, null, dbName);
    },

    /**
     * 删除指定视频的所有标签关联
     * @param {number} videoId - 视频 ID
     * @returns {Promise<ExecResult>}
     */
    deleteTags: (videoId) => {
        const sql = 'DELETE FROM video_tag_map WHERE video_id=?';
        return __sqliteDB.delete(sql, [videoId], null, dbName);
    },

    /**
     * 删除指定视频下的特定标签关联列表
     * @param {number} videoId - 视频 ID
     * @param {number[]} tagIds - 标签 ID 列表
     * @returns {Promise<ExecResult|void>}
     */
    deleteTagsWithId: (videoId, tagIds) => {
        if (__isEmptyArray(tagIds)) {
            return Promise.resolve();
        }
        let sql = 'DELETE FROM video_tag_map WHERE video_id=? AND tag_id IN (';
        sql += tagIds.map(() => '?').join(',') + ')';
        return __sqliteDB.delete(sql, [videoId, ...tagIds], null, dbName);
    },

    /**
     * 查询指定分类下的标签列表及其视频使用频次统计
     * @param {number} categoryId - 分类 ID
     * @param {number} [videoId=null] - 可选的视频 ID，用于筛选该视频所拥有的标签
     * @returns {Promise<QueryResult<{ id: number, name: string, usageCount: number }>>}
     */
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

    /**
     * 清理孤儿关联数据（删除 videos 表中已不存在的脏 video_tag_map 记录）
     * @returns {Promise<number[]>} 已清理的脏 videoId 数组
     */
    deleteDirtyVideoTagMapping: async () => {
        let toRemoveVideoIds = [];
        const sql = `SELECT DISTINCT video_id FROM video_tag_map vt WHERE NOT EXISTS (SELECT 1 FROM videos WHERE videos.id = vt.video_id)`;
        const { data, rows } = await __sqliteDB.selectAll(sql, [], null, dbName);
        if (rows > 0) {
            toRemoveVideoIds = data.map(o => o.videoId);
            const delSql = 'DELETE FROM video_tag_map WHERE video_id IN ('
                + toRemoveVideoIds.map(() => '?').join(',') + ')';
            await __sqliteDB.delete(delSql, toRemoveVideoIds, null, dbName);
        }
        return toRemoveVideoIds;
    }
};