const dbName = 'rss'
const enablePrint = { print: true }

export default {
    /* Episode */
    selectOneById: (id) => {
        const sql = 'SELECT minio_link link, status FROM rss_episode WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    selectBySubsId: (subsId) => {
        const sql = 'SELECT re.id, re.rss_subs_id, re.rss_task_id, re.episode, re.minio_link link, re.status status, rtt.status taskStatus ' +
            'FROM rss_episode re ' +
            'LEFT JOIN rss_torrent_task rtt on rtt.id=re.rss_task_id ' +
            'WHERE re.rss_subs_id=?'
        return __sqliteDB.selectAll(sql, [subsId], null, dbName)
    },
    selectExistsBySubsIdAndEpisode: (subsId, episode) => {
        const sql = 'SELECT COUNT(1) as count FROM rss_episode WHERE rss_subs_id = ? AND episode = ?'
        return __sqliteDB.selectOne(sql, [subsId, episode], null, dbName).then(data => data.count > 0)
    },
    insertOne: (rssEpisode, transactionDB) => {
        const sql = 'INSERT INTO rss_episode (rss_task_id, rss_subs_id, episode, minio_link, status) SELECT ?,?,?,?,? WHERE NOT EXISTS (' +
            'SELECT 1 FROM rss_episode WHERE rss_subs_id = ? AND episode = ?)'
        const params = [
            rssEpisode.rssTaskId,
            rssEpisode.rssSubsId,
            rssEpisode.episode,
            rssEpisode.minioLink,
            rssEpisode.status ?? '0',
            rssEpisode.rssSubsId,
            rssEpisode.episode
        ]
        return (transactionDB || __sqliteDB).insert(sql, params, null, dbName)
    },
    updateStatusById: (id, status) => {
        const sql = 'UPDATE rss_episode SET status = ? WHERE id = ?'
        return __sqliteDB.update(sql, [status, id], null, dbName)
    },
    deleteOneById: (id) => {
        const sql = 'DELETE FROM rss_episode WHERE id=?'
        return __sqliteDB.delete(sql, [id], null, dbName)
    },
    /* Failed episode */
    selectOneFailedById: id => {
        const sql = 'SELECT id, rss_task_id, rss_subs_id, episode, minio_link, root_path, file_name, reason, create_time FROM rss_episode_failed WHERE id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName)
    },
    selectFailedBySubsId: (subsId) => {
        const sql = 'SELECT re.id, re.rss_subs_id, re.rss_task_id, re.episode, re.reason reason, re.create_time, re.file_name, re.root_path, re.minio_link AS link, rtt.status taskStatus ' +
            'FROM rss_episode_failed re ' +
            'LEFT JOIN rss_torrent_task rtt on rtt.id=re.rss_task_id ' +
            'WHERE re.rss_subs_id=?'
        return __sqliteDB.selectAll(sql, [subsId], null, dbName)
    },
    insertOneFailed: (rssEpisodeFailed, transactionDB) => {
        const sql = 'INSERT INTO rss_episode_failed (rss_task_id, rss_subs_id, episode, minio_link, root_path, file_name, reason, create_time) VALUES (?,?,?,?,?,?,?,?)'
        const params = [
            rssEpisodeFailed.rssTaskId,
            rssEpisodeFailed.rssSubsId,
            rssEpisodeFailed.episode,
            rssEpisodeFailed.minioLink,
            rssEpisodeFailed.rootPath,
            rssEpisodeFailed.fileName,
            rssEpisodeFailed.reason ?? '0',
            new Date()
        ]
        return (transactionDB || __sqliteDB).insert(sql, params, null, dbName)
    },
    updateFailedReasonById: (id, reason, episode) => {
        const params = [reason]
        let sql = 'UPDATE rss_episode_failed SET reason = ? '
        if (episode) {
            sql += ', episode = ? '
            params.push(episode)
        }
        sql += 'WHERE id = ?'
        params.push(id)
        return __sqliteDB.update(sql, params, null, dbName)
    },
    updateFailedMinioLinkAndReasonById: (id, minioLink, reason, episode) => {
        const params = [reason, minioLink]
        let sql = 'UPDATE rss_episode_failed SET reason = ?, minio_link = ? '
        if (episode) {
            sql += ', episode = ? '
            params.push(episode)
        }
        sql += 'WHERE id = ?'
        params.push(id)
        return __sqliteDB.update(sql, params, null, dbName)
    },
    updateFailedEpisodeById: (data) => {
        const sql = 'UPDATE rss_episode_failed SET episode=?, minio_link=?, root_path=?, file_name=? WHERE id=? AND reason != 3'
        return __sqliteDB.update(sql, [
            data.episode ?? null,
            data.link ?? null,
            data.rootPath,
            data.fileName,
            data.id
        ], null, dbName)
    },
    deleteOneFailedById: id => {
        const sql = 'DELETE FROM rss_episode_failed WHERE id=?'
        return __sqliteDB.delete(sql, [id], null, dbName)
    },
    selectFailedTaskExistsById: id => {
        const sql = 'SELECT ref.id, COUNT(rt.id) count FROM rss_episode_failed ref INNER JOIN rss_torrent_task rt ON ref.rss_task_id=rt.id WHERE ref.id=?'
        return __sqliteDB.selectOne(sql, [id], null, dbName).then(data => data.count > 0)
    }
}