import {
    addTorrent, getUUIDByTorrentInfo, torrentFiles,
    torrentInfo, deleteTorrent, deleteTag, torrentsInfo,
    generateTorrentState, stopTorrent, startTorrent
} from "../download/qbitorrentHandler.js";
import rssRep from "../../repository/rss/rssRep.js";
import rssTaskRep from "../../repository/rss/rssTaskRep.js";
import rssFavoritesRep from "../../repository/account/rssFavoritesRep.js";
import { TASK_STATUS, EPISODE_STATUS, EPISODE_FAILED_REASON } from "../../constraints/rssTaskStatusConst.js";
import path, { join } from 'path';
import rssEpisodeRep from "../../repository/rss/rssEpisodeRep.js";
import { pushNotification } from "../../sockets/notification.js";
import { generateMinioLink, getAnimeEpisode, isFileExtAnime } from "./rssEpisodeHandler.js";
import rssResultRep from "../../repository/rss/rssResultRep.js";

const TORRENT_STOPPED_STATE = ['stoppedDL', 'stoppedUP', 'stalledUP']
const canUpdateStatus = [TASK_STATUS.RESOLVING, TASK_STATUS.COMPLETE, TASK_STATUS.PARTIALLY_COMPLETE]
const canDeleteStatus = [TASK_STATUS.FAILED, TASK_STATUS.DOWNLOADING, TASK_STATUS.RESOLVE_FAILED, TASK_STATUS.COMPLETE]
const canCompleteStatus = [TASK_STATUS.PARTIALLY_COMPLETE]

export function addRssTasksFromFavorites(rssSubsArr) {
    const arr = Array.from(rssSubsArr)
    if (arr.length === 0) return
    rssFavoritesRep.selectUserFavoritesBySubsIds(arr.map(o => o.rssSubsId)).then(async data => {
        const favorites = Array.from(data).map(o => o.rssSubscribeId)
        const tasks = arr.filter(o => favorites.includes(o.rssSubsId))
        for (const rssTask of tasks) {
            await addRssTask(rssTask)
        }
    })
}

export async function addRssTask(rssTask) {
    const { torrent, title, rssSubsId, resultId } = rssTask
    const exists = await rssTaskRep.selectExistsByResultId(resultId)
    if (exists) {
        __log.error(`[RssTask] Add torrent task failed: [${rssSubsId}:${resultId}], Cause exists.`)
        return null
    } else {
        __log.info(`[RssTask] Add torrent task: [${rssSubsId}:${resultId}] ${title}`)
    }
    let taskId = -1
    let taskStatus = TASK_STATUS.FAILED
    let toSaveRssTask = rssTask
    try {
        const res = await addTorrent(torrent)
        if (!res) {
            __log.error(`[RssTask] Add torrent task([${rssSubsId}:${resultId}] ${title}) failed. Cause unknown.`)
        } else if (typeof res === 'string') {
            __log.info(`[RssTask] Add torrent task([${rssSubsId}:${resultId}] ${title}) success. UUID: ${res}`)
            taskStatus = TASK_STATUS.DOWNLOADING
            toSaveRssTask = { ...rssTask, uuid: res }
        } else {
            __log.info(`[RssTask] Add torrent task([${rssSubsId}:${resultId}] ${title}) success. Hash: ${res.hash}`)
            taskStatus = TASK_STATUS.DOWNLOADING
            toSaveRssTask = { ...rssTask, hash: res.hash, uuid: getUUIDByTorrentInfo(res) }
        }
    } catch (e) {
        __log.error(`[RssTask] Add torrent task([${rssSubsId}:${resultId}] ${title}) failed. Cause: `, e)
    } finally {
        taskId = await saveTask(toSaveRssTask, taskStatus)
    }
    if (TASK_STATUS.DOWNLOADING === taskStatus) {
        const rssResult = await rssResultRep.selectResultTitleById(resultId)
        pushNotification(`[Task Added] ${rssResult?.title}`)
    }
    return { id: taskId, status: taskStatus }
}

export async function updateTaskStatus(uuid, status) {
    if (!canUpdateStatus.includes(status)) {
        throwMessage('Invalid task status.')
    }
    const rssTask = await rssTaskRep.selectByUUID(uuid)
    if (!rssTask) {
        throwMessage('Unknown task.')
    }
    await rssTaskRep.updateStatusByUUID(uuid, status)
    switch (status) {
        case TASK_STATUS.RESOLVING:
            try {
                return await resolveTaskEpisode(rssTask);
            } catch (error) {
                pushNotification(`Resolve rss task error. Please handle it manually. Task UUID: ${uuid}`)
                throw error
            }
        case TASK_STATUS.COMPLETE:
            __log.info(`[RssTask] Update task status: Complete. Remove torrent task.`)
            await taskCompleted(rssTask)
            break;
        case TASK_STATUS.PARTIALLY_COMPLETE:
            __log.info(`[RssTask] Update task status: Partially Complete.`)
            break;
    }
}

async function resolveTaskEpisode(rssTask) {
    const { id, rssSubsId } = rssTask
    const rssSubs = await rssRep.selectOneById(rssSubsId)
    const uuid = rssTask.uuid
    let hash = rssTask.hash

    // check torrent info
    const info = await torrentInfo(uuid)
    if (!info) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task info not found.`)
        await rssTaskRep.updateStatusByUUID(uuid, TASK_STATUS.RESOLVE_FAILED);
        return;
    }

    // check torrent task completion
    if (info.progress !== 1) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task download not complete.`)
        await rssTaskRep.updateStatusByUUID(uuid, TASK_STATUS.DOWNLOADING);
        throwMessage(`Task not ready.`)
    }
    hash ??= info.hash
    const rootPath = info['root_path'] || info['save_path']
    const fileInfo = await torrentFiles(hash)
    if (!fileInfo) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task files not found.`)
        await rssTaskRep.updateStatusByUUID(uuid, TASK_STATUS.RESOLVE_FAILED);
        return;
    }

    const files = Array.from(fileInfo)
    const resultArr = []
    let failedCount = 0
    let skippedCount = 0
    for (const fileInfo of files) {
        let file = fileInfo.name
        const index = file.lastIndexOf('/')
        if (index > -1) {
            file = file.substring(index + 1)
        }
        const filePath = join(rootPath, file)
        const ext = path.extname(file)
        const animeName = rssSubs.name
        const episodeFailed = {
            rssTaskId: id,
            rssSubsId,
            rootPath,
            fileName: file
        }

        if (!isFileExtAnime(ext)) {
            __log.error(`[RssTask] Resolve task[${rssTask.id}] file ext failed, cause it's not a video file: ${filePath}`)
            skippedCount++
            continue
        }

        // generate episode and validate
        const episode = getAnimeEpisode(file)
        if (!episode) {
            __log.error(`[RssTask] Resolve task[${rssTask.id}] file episode failed: ${filePath}`)
            failedCount++
            episodeFailed.reason = EPISODE_FAILED_REASON.RESOLVE_FAILED
            await rssEpisodeRep.insertOneFailed(episodeFailed)
            continue
        }
        episodeFailed.episode = episode

        // check episode exists
        const exists = await rssEpisodeRep.selectExistsBySubsIdAndEpisode(rssSubsId, episode)
        if (exists) {
            __log.error(`[RssTask] Resolve task[${rssTask.id}] file episode failed. Cause episode[${episode}] exists.`)
            failedCount++
            episodeFailed.reason = EPISODE_FAILED_REASON.EPISODE_EXISTS
            await rssEpisodeRep.insertOneFailed(episodeFailed)
            continue
        }

        // generate minio link and save
        const minioLink = generateMinioLink(rssSubs.season, animeName, episode, ext)
        episodeFailed.minioLink = minioLink
        __log.info(`[RssTask] Resolve task[${rssTask.id}] file episode success: ${filePath} ==> ${minioLink}`)
        const rssEpisode = {
            rssTaskId: id,
            rssSubsId,
            episode,
            minioLink,
            filePath,
            status: EPISODE_STATUS.PREPARED
        }
        const { lastId, rows } = await rssEpisodeRep.insertOne(rssEpisode)

        // save failed
        if (rows === 0) {
            __log.error(`[RssTask] Insert task[${rssTask.id}] file episode failed: ${filePath} ==> ${minioLink}. Cause episode[${episode}] exists.`)
            failedCount++
            episodeFailed.reason = EPISODE_FAILED_REASON.EPISODE_EXISTS
            await rssEpisodeRep.insertOneFailed(episodeFailed)
            continue
        }

        // put on result array
        resultArr.push(rssEpisode)
        rssEpisode.id = lastId
    }

    __log.info(`[RssTask] Resolve task[${rssTask.id}] complete. Success: ${files.length - failedCount - skippedCount}, Skipped: ${skippedCount}, Failed: ${failedCount}.`)

    // update task status
    await rssTaskRep.updateStatusByUUID(uuid, TASK_STATUS.UPLOADING);

    // build result data
    const data = {
        failed: failedCount,
        skipped: skippedCount,
        result: []
    }
    if (resultArr.length > 0) {
        data.result = resultArr.map(o => ({
            file: o.filePath,
            link: o.minioLink,
            id: o.id
        }))
    }
    return data
}

async function taskCompleted(rssTask) {
    const uuid = rssTask.uuid
    let hash = rssTask.hash

    // check torrent info
    const info = await torrentInfo(uuid)
    if (!info) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task info not found.`)
        return;
    }

    // check torrent task completion
    if (info.progress !== 1) {
        __log.error(`[RssTask] Resolve task[${rssTask.id}] episode failed. Cause task download not complete.`)
        throwMessage(`Task not ready.`)
    }
    hash ??= info.hash

    await deleteTag(uuid)
    await deleteTorrent(hash)

    const rssResultId = rssTask.rssResultId
    const rssResult = await rssResultRep.selectResultTitleById(rssResultId)
    pushNotification(`[Torrent Complete] ${rssResult?.title}`)
}

function saveTask(rssTask, status = TASK_STATUS.FAILED) {
    __log.debug(`[RssTask] Save one task, status: ${status}.`)
    return rssTaskRep.insertOne({ ...rssTask, status }).then(res => res.lastId)
}

export async function queryTaskTorrentInfo(taskIds) {
    const tasks = await rssTaskRep.selectByIds(taskIds)
    const toQuery = []
    const excludes = tasks.filter(t => {
        if (t.hash) {
            toQuery.push(t)
            return false
        }
        return true
    })
    setupTasksHashByUUID(excludes)
    const info = await torrentsInfo(toQuery.map(t => t.hash))
    const arr = Array.from(info || [])
    return toQuery.map(t => {
        const result = { id: t.id }
        const obj = arr.find(o => o.hash === t.hash)
        if (obj) {
            result.percent = (obj.progress * 100).toFixed(1) + '%'
            result.state = generateTorrentState(obj)
        }
        return result
    })
}

async function setupTasksHashByUUID(tasks) {
    const arr = Array.from(tasks)
    if (arr.length === 0) return
    for (const task of arr) {
        try {
            const { id, uuid } = task
            const info = await torrentInfo(uuid)
            if (info && info.hash) {
                await rssTaskRep.updateTaskHashById(id, info.hash)
            }
        } catch (error) {
            __log.error(`[RssTask] Setup task[${id}] hash failed.`, error)
        }
    }
}

export async function queryTasks(rssSubsId) {
    return rssTaskRep.selectBySubsIdWithResultExists(rssSubsId).then(({ data }) => data)
}

export async function deleteTask(taskId) {
    const task = await rssTaskRep.selectOneStatusById(taskId)
    if (!canDeleteStatus.includes(task?.status)) {
        throwMessage('Cannot delete task.')
    }
    const uuid = task.uuid
    let hash = task.hash
    const info = await torrentInfo(uuid)
    if (!info) {
        __log.warn(`[RssTask] Task torrent info[${task.id}] not found.`)
    } else if (!TORRENT_STOPPED_STATE.includes(info.state)) {
        __log.error(`[RssTask] Cannot delete torrent task[${task.id}]. Cause torrent state[${info.state}] not stopped.`)
        throwMessage('Task state not stopped.')
    } else {
        hash ??= info.hash
        await deleteTag(uuid)
        await deleteTorrent(hash, true)
    }
    return rssTaskRep.deleteOneById(taskId)
}

export async function pauseTask(taskId) {
    const tasks = await rssTaskRep.selectByIds([taskId])
    if (tasks.length === 0) {
        throwMessage('Task not found.')
    }
    const task = tasks[0]
    if (!task.hash) {
        throwMessage('Invalid task hash.')
    }
    await stopTorrent([task.hash])
}

export async function resumeTask(taskId) {
    const tasks = await rssTaskRep.selectByIds([taskId])
    if (tasks.length === 0) {
        throwMessage('Task not found.')
    }
    const task = tasks[0]
    if (!task.hash) {
        throwMessage('Invalid task hash.')
    }
    await startTorrent([task.hash])
}

export async function completeTask(taskId) {
    const task = await rssTaskRep.selectOneStatusById(taskId)
    if (!canCompleteStatus.includes(task?.status)) {
        throwMessage('Cannot complete task.')
    }
    const uuid = task.uuid
    let hash = task.hash
    const info = await torrentInfo(uuid)
    if (!info) {
        __log.warn(`[RssTask] Task torrent info[${task.id}] not found.`)
    } else if (!TORRENT_STOPPED_STATE.includes(info.state)) {
        __log.error(`[RssTask] Cannot delete torrent task[${task.id}]. Cause torrent state[${info.state}] not stopped.`)
        throwMessage('Task state not stopped.')
    } else {
        hash ??= info.hash
        await deleteTag(uuid)
        await deleteTorrent(hash, true)
    }
    return rssTaskRep.updateStatusById(taskId, TASK_STATUS.COMPLETE)
}