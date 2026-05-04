import { EPISODE_STATUS, EPISODE_FAILED_REASON } from "../constants/rssTaskStatusConst.js";
import { getMinioClient } from "../../../core/instance/minioClient.js";
import rssEpisodeRep from "../repository/rssEpisodeRep.js";
import rssRep from "../repository/rssRep.js";
import { getSSHExecutor } from "../../../core/instance/sshExecutor.js";
import { getEpisodeMatches } from "./rssResultService.js";
import path, { join } from 'path';
import { SSH_CMD_MINIO_MOVE_SCRIPT } from "../../../common/constants/sshScriptsConst.js";
import { pushNotification } from "../../../api/sockets/notification.js";
import { convertMkvToMp4, deleteRemoteFiles } from "./rssTaskService.js";

const cannotRetryFailedEpisodeReason = [EPISODE_FAILED_REASON.SUCCESS]

export function isFileExtAnime(ext) {
    const reg = __env.get('rss.animeExtRegex')
    if (__isBlank(reg)) {
        __log.warn(`[RssEpisode] Get rss anime ext regex empty. Skipped validate file ext.`)
        return true;
    }
    try {
        return new RegExp(reg, 'i').test(ext)
    } catch (error) {
        __log.error(`[RssEpisode] Validate anime ext failed. Regex: ${reg}`, error)
        return false
    }
}

export function getAnimeEpisode(file) {
    let episode = null
    getEpisodeMatches().some(match => {
        const exec = new RegExp(match, 'i').exec(file);
        if (exec !== null) {
            episode = exec[1];
            return true;
        }
        return false;
    })
    return episode
}

export function generateMinioLink(season, animeName, episode, ext) {
    return `/anime/${season}/${animeName}/${animeName} - ${episode}${ext}`
}

export async function generateMinioSharedLink(episodeId) {
    const episode = await rssEpisodeRep.selectOneById(episodeId)
    if (!episode) {
        __throwMessage('Episode not found.')
    }
    return episode.link
}

export async function deleteOneEpisode(episodeId) {
    const episode = await rssEpisodeRep.selectOneById(episodeId)
    if (!episode) {
        __throwMessage('Episode not found.')
    }
    const canDelStatus = [EPISODE_STATUS.COMPLETE, EPISODE_STATUS.FAILED]
    if (!canDelStatus.includes(episode.status)) {
        __throwMessage('Episode cannot delete.')
    }
    if (EPISODE_STATUS.FAILED === episode.status) {
        // failed episode, directly delete
        return rssEpisodeRep.deleteOneById(episodeId)
    }
    // delete minio object first
    const client = getMinioClient()
    if (!client?.ready()) {
        __throwMessage('Minio client not ready.')
    }
    await client.deleteObject(episode.link)
    return rssEpisodeRep.deleteOneById(episodeId)
}

export async function retryFailedEpisode(failedEpisodeId) {
    const failed = await rssEpisodeRep.selectOneFailedById(failedEpisodeId)
    if (!failed) {
        __throwMessage('Failed episode not found.')
    }

    if (cannotRetryFailedEpisodeReason.includes(failed.reason)) {
        __throwMessage('Failed episode cannot retry.')
    }

    let episode = failed.episode
    const rssTaskId = failed.rssTaskId
    const rssSubsId = failed.rssSubsId
    const fileName = failed.fileName
    const simpleFileName = path.basename(fileName)
    const rootPath = failed.rootPath
    const ext = path.extname(simpleFileName)
    const filePath = join(rootPath, fileName)

    if (!isFileExtAnime(ext)) {
        __throwMessage('Not a video file.')
    }

    const rssSubs = await rssRep.selectOneById(rssSubsId)
    if (!rssSubs) {
        __throwMessage('Rss subscribe not found.')
    }

    if (ext === '.mkv') {
        const mp4FileName = fileName.substring(0, fileName.length - 4) + '.mp4'
        const mp4FilePath = join(rootPath, mp4FileName)
        __log.info(`[RssEpisode] Failed episode[${failedEpisodeId}] file is mkv, ready to convert to mp4: ${filePath} -> ${mp4FilePath}`)
        const convertResult = await convertMkvToMp4(filePath, mp4FilePath)
        if (convertResult === 1) {
            failed.fileName = mp4FileName;
            const originFilePath = filePath;
            filePath = mp4FilePath;
            ext = '.mp4';
            __log.info(`[RssEpisode] Failed episode[${failedEpisodeId}] file convert to mp4 success. Remove origin mkv file: ${originFilePath}`)
            await rssEpisodeRep.updateFailedEpisodeFileNameById(mp4FileName, failedEpisodeId)
            await deleteRemoteFiles([originFilePath])
        } else {
            __throwMessage('Convert file mkv to mp4 failed.')
        }
    }

    const animeName = rssSubs.name

    // generate episode and validate
    episode ??= getAnimeEpisode(simpleFileName)
    if (!episode) {
        __log.error(`[RssEpisode] Resolve failedEpisode[${failedEpisodeId}] failed: ${filePath}`)
        await rssEpisodeRep.updateFailedReasonById(failedEpisodeId, EPISODE_FAILED_REASON.RESOLVE_FAILED)
        __throwMessage('Resolve episode failed.')
    }

    // check episode exists
    const exists = await rssEpisodeRep.selectExistsBySubsIdAndEpisode(rssSubsId, episode)
    if (exists) {
        __log.error(`[RssEpisode] Resolve failedEpisode[${failedEpisodeId}] failed. Cause episode[${episode}] exists.`)
        await rssEpisodeRep.updateFailedReasonById(failedEpisodeId, EPISODE_FAILED_REASON.EPISODE_EXISTS, episode)
        __throwMessage('Episode exists.')
    }

    // generate minio link and save
    const minioLink = generateMinioLink(rssSubs.season, animeName, episode, ext)
    __log.info(`[RssEpisode] Resolve failedEpisode[${failedEpisodeId}] success: ${filePath} ==> ${minioLink}`)
    const rssEpisode = {
        rssTaskId,
        rssSubsId,
        episode,
        minioLink,
        status: EPISODE_STATUS.PREPARED
    }
    const { lastId, rows } = await rssEpisodeRep.insertOne(rssEpisode)

    // save failed
    if (rows === 0) {
        __log.error(`[RssEpisode] Insert failedEpisode[${failedEpisodeId}] failed: ${filePath} ==> ${minioLink}. Cause episode[${episode}] exists.`)
        await rssEpisodeRep.updateFailedMinioLinkAndReasonById(failedEpisodeId, minioLink, EPISODE_FAILED_REASON.EPISODE_EXISTS, episode)
        __throwMessage('Episode exists.')
    }

    // call minio move
    const code = await executeRetryFailedEpisodeResolveCommand(filePath, minioLink)

    const statusMap = {
        [-2]: 'Generate executor failed.',
        [-1]: 'Minio client not ready.',
        1: "SUCCESS",
        2: "Execute script failed.",
        255: "Script execution missing params."
    }

    if (code === 1) {
        await rssEpisodeRep.updateFailedReasonById(failedEpisodeId, EPISODE_FAILED_REASON.SUCCESS, episode)
        await rssEpisodeRep.updateStatusById(lastId, EPISODE_STATUS.COMPLETE)
    } else {
        await rssEpisodeRep.updateStatusById(lastId, EPISODE_STATUS.FAILED)
        __throwMessage(statusMap[code] || `UNKNOWN_ERROR_${code}`)
    }
}

async function executeRetryFailedEpisodeResolveCommand(filePath, minioLink) {
    const client = getMinioClient()
    if (!client.ready()) {
        logAndPushNotification(`Upload minio object failed. Cause client not ready.`)
        return -1;
    }
    const suitableMinioLink = client.generateSuitableMinioLink(minioLink);
    const executor = getSSHExecutor('storage')
    if (!executor) {
        return -2
    }
    try {
        const { code } = await executor.exec(SSH_CMD_MINIO_MOVE_SCRIPT, [filePath, suitableMinioLink]);
        return parseInt(code)
    } catch (e) {
        __log.error('Execute ssh script failed.', e.message ?? e)
        return 2
    }
}

export async function updateFailedEpisode(data) {
    const { rows } = await rssEpisodeRep.updateFailedEpisodeById(data)
    if (rows === 0) {
        __throwMessage('Failed.')
    }
}

export async function deleteOneFailedEpisode(failedEpisodeId) {
    const taskExists = await rssEpisodeRep.selectFailedTaskExistsById(failedEpisodeId)
    if (taskExists) {
        __throwMessage('Task exists, cannot delete.')
    }
    return rssEpisodeRep.deleteOneFailedById(failedEpisodeId)
}

function logAndPushNotification(message) {
    __log.error(message)
    pushNotification(message)
}