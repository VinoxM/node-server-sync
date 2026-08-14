import { RSS_SUBTITLE_FILE_STATUS, RSS_SUBTITLE_STATUS } from "../constants/rssSubtitleStatusConst.js"

const dbName = 'rss'
const enablePrint = { print: true }

const FULL_COLUMN = [
    'id',
    'rss_task_id',
    'rss_subs_id',
    'title', 'episode',
    'minio_link',
    'root_path',
    'file_name',
    'fonts',
    'status',
    'file_status'
]

export default {
    selectExistsByFileNameAndRootPath: (fileName, rootPath) => {
        const sql = `SELECT EXISTS(SELECT 1 FROM rss_episode_subtitle WHERE file_name = ? AND root_path = ? LIMIT 1) AS [exists]`
        return __sqliteDB.selectOne(sql, [fileName, rootPath], null, dbName).then(({ exists }) => exists)
    },
    insertOne: (subtitle) => {
        const sql = `INSERT INTO rss_episode_subtitle(rss_task_id, rss_subs_id, title, episode, minio_link, root_path, file_name, fonts, status, file_status) `
            + `VALUES(?,?,?,?,?,?,?,?,?,?)`
        const params = [
            subtitle.taskId,
            subtitle.subsId,
            subtitle.title,
            subtitle.episode,
            subtitle.minioLink,
            subtitle.rootPath,
            subtitle.fileName,
            subtitle.fonts,
            RSS_SUBTITLE_STATUS.PREPARED,
            RSS_SUBTITLE_FILE_STATUS.EXISTS
        ]
        return __sqliteDB.insert(sql, params, null, dbName);
    },
    updateSubtitleStatusById: (id, status) => {
        const sql = `UPDATE rss_episode_subtitle SET status=? WHERE id=?`
        return __sqliteDB.update(sql, [status, id], null, dbName);
    },
    updateSubtitleFileStatusById: (id, fileStatus) => {
        const sql = `UPDATE rss_episode_subtitle SET file_status=? WHERE id=?`
        return __sqliteDB.update(sql, [fileStatus, id], null, dbName);
    },
    updateSubtitleMinioLinkById: (id, minioLink) => {
        const sql = `UPDATE rss_episode_subtitle SET minio_link=? WHERE id=?`
        return __sqliteDB.update(sql, [minioLink, id], null, dbName);
    },
    updateSubtitleFontsById: (id, fonts) => {
        const sql = `UPDATE rss_episode_subtitle SET fonts=? WHERE id=?`
        return __sqliteDB.update(sql, [fonts, id], null, dbName);
    },
    updateSubtitleTitleById: (id, title) => {
        const sql = `UPDATE rss_episode_subtitle SET title=? WHERE id=?`
        return __sqliteDB.update(sql, [title, id], null, dbName);
    },
    updateSubtitleEpisodeById: (id, episode) => {
        const sql = `UPDATE rss_episode_subtitle SET episode=? WHERE id=?`
        return __sqliteDB.update(sql, [episode, id], null, dbName);
    },
    updateSubtitleById: (data) => {
        const sql = `UPDATE rss_episode_subtitle SET episode=?,title=?,fonts=?,minio_link=? WHERE id=?`
        return __sqliteDB.update(sql, [
            data.episode ?? null,
            data.title ?? null,
            data.fonts ?? null,
            data.minioLink ?? null,
            data.id
        ], null, dbName)
    },
    selectOneById: id => {
        const sql = `SELECT ${FULL_COLUMN.join(',')} FROM rss_episode_subtitle WHERE id=?`
        return __sqliteDB.selectOne(sql, [id], null, dbName);
    },
    deleteOneById: id => {
        const sql = `DELETE FROM rss_episode_subtitle WHERE id=?`
        return __sqliteDB.delete(sql, [id], null, dbName);
    },
    selectBySubsId: rssSubsId => {
        const sql = `SELECT ${FULL_COLUMN.join(',')} FROM rss_episode_subtitle WHERE rss_subs_id=?`
        return __sqliteDB.selectAll(sql, [rssSubsId], null, dbName);
    },
    selectBySubsIdAndEpisode: (rssSubsId, episode) => {
        const sql = `SELECT ${FULL_COLUMN.join(',')} FROM rss_episode_subtitle WHERE rss_subs_id=? AND episode=? AND status=?`
        return __sqliteDB.selectAll(sql, [rssSubsId, episode, RSS_SUBTITLE_STATUS.COMPLETE], null, dbName);
    },
    selectFailedCount: () => {
        const sql = `SELECT COUNT(*) AS count FROM rss_episode_subtitle WHERE status=${RSS_SUBTITLE_STATUS.FAILED}`
        return __sqliteDB.selectOne(sql, [], null, dbName).then(data => data?.count || 0)
    }
}