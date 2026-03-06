import { EPISODE_STATUS, EPISODE_FAILED_REASON } from "../../constraints/rssTaskStatusConst.js";
import { getMinioClient } from "../../instance/minio.js";
import rssEpisodeRep from "../../repository/rss/rssEpisodeRep.js";
import rssRep from "../../repository/rss/rssRep.js";
import { getExecutor } from "../sshHandler.js";
import { getEpisodeMatches } from "./rssResultHandler.js";
import path, { join } from 'path';
import { SSH_CMD_MINIO_COPY_SCRIPT } from "../../constraints/sshScriptsConst.js";

const cannotRetryFailedEpisodeReason = [EPISODE_FAILED_REASON.SUCCESS]

export function isFileExtAnime(ext) {
    const reg = __env.get('rss.animeExtRegex')
    if (isBlank(reg)) {
        __log.warn(`[RssEpisode] Get rss anime ext regex empty. Skipped validate file ext.`)
        return true;
    }
    try {
        const regex = new RegExp(reg, 'i')
        return regex.test(ext)
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
    // const uuid = generateUUID().replaceAll(/-/g, '')
    return `/anime/${season}/${animeName}/${animeName} - ${episode}${ext}`
}

export async function generateMinioSharedLink(episodeId) {
    const episode = await rssEpisodeRep.selectOneById(episodeId)
    if (!episode) {
        throwMessage('Episode not found.')
    }
    let link = String(episode.link)
    if (link.startsWith('/')) {
        link = link.slice(1)
    }
    const index = link.indexOf('/')
    if (index === -1) {
        throwMessage('Invalid episode minio link.')
    }
    const bucket = link.substring(0, index)
    const objectName = link.substring(index + 1)
    const client = getMinioClient()
    if (!client?.ready()) {
        throwMessage('Minio client not ready.')
    }
    return client.generateShareLink(bucket, objectName)
}

export async function deleteOneEpisode(episodeId) {
    const episode = await rssEpisodeRep.selectOneById(episodeId)
    if (!episode) {
        throwMessage('Episode not found.')
    }
    const canDelStatus = [EPISODE_STATUS.COMPLETE, EPISODE_STATUS.FAILED]
    if (!canDelStatus.includes(episode.status)) {
        throwMessage('Episode cannot delete.')
    }
    if (EPISODE_STATUS.FAILED === episode.status) {
        // failed episode, directly delete
        return rssEpisodeRep.deleteOneById(episodeId)
    }
    // delete minio object first
    let link = String(episode.link)
    if (link.startsWith('/')) {
        link = link.slice(1)
    }
    const index = link.indexOf('/')
    if (index === -1) {
        throwMessage('Invalid episode minio link.')
    }
    const bucket = link.substring(0, index)
    const objectName = link.substring(index + 1)
    const client = getMinioClient()
    if (!client?.ready()) {
        throwMessage('Minio client not ready.')
    }
    await client.deleteObject(bucket, objectName)
    return rssEpisodeRep.deleteOneById(episodeId)
}

export async function retryFailedEpisode(failedEpisodeId) {
    const failed = await rssEpisodeRep.selectOneFailedById(failedEpisodeId)
    if (!failed) {
        throwMessage('Failed episode not found.')
    }

    if (cannotRetryFailedEpisodeReason.includes(failed.reason)) {
        throwMessage('Failed episode cannot retry.')
    }

    let episode = failed.episode
    const rssTaskId = failed.rssTaskId
    const rssSubsId = failed.rssSubsId
    const file = failed.fileName
    const rootPath = failed.rootPath
    const ext = path.extname(file)
    const filePath = join(rootPath, file)

    if (!isFileExtAnime(ext)) {
        throwMessage('Not a video file.')
    }

    const rssSubs = await rssRep.selectOneById(rssSubsId)
    if (!rssSubs) {
        throwMessage('Rss subscribe not found.')
    }

    const animeName = rssSubs.name

    // generate episode and validate
    episode ??= getAnimeEpisode(file)
    if (!episode) {
        __log.error(`[RssEpisode] Resolve failedEpisode[${failedEpisodeId}] failed: ${filePath}`)
        await rssEpisodeRep.updateFailedReasonById(failedEpisodeId, EPISODE_FAILED_REASON.RESOLVE_FAILED)
        throwMessage('Resolve episode failed.')
    }

    // check episode exists
    const exists = await rssEpisodeRep.selectExistsBySubsIdAndEpisode(rssSubsId, episode)
    if (exists) {
        __log.error(`[RssEpisode] Resolve failedEpisode[${failedEpisodeId}] failed. Cause episode[${episode}] exists.`)
        await rssEpisodeRep.updateFailedReasonById(failedEpisodeId, EPISODE_FAILED_REASON.EPISODE_EXISTS, episode)
        throwMessage('Episode exists.')
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
        throwMessage('Episode exists.')
    }

    // call minio move
    const code = await executeRetryFailedEpisodeResolveCommand([filePath, minioLink])

    const statusMap = {
        1: "SUCCESS",
        2: "FAILED",
        255: "MISSING_PARAMS"
    }

    if (code === 1) {
        await rssEpisodeRep.updateFailedReasonById(failedEpisodeId, EPISODE_FAILED_REASON.SUCCESS, episode)
        await rssEpisodeRep.updateStatusById(lastId, EPISODE_STATUS.COMPLETE)
    } else {
        await rssEpisodeRep.updateStatusById(lastId, EPISODE_STATUS.FAILED)
        throwMessage(statusMap[code] || `UNKNOWN_ERROR_${code}`)
    }
}

async function executeRetryFailedEpisodeResolveCommand(args) {
    const executor = getExecutor('fedora')
    if (!executor) {
        throwMessage('Generate executor failed.')
    }
    const { code } = await executor.exec(SSH_CMD_MINIO_COPY_SCRIPT, args);
    return code
}

export async function updateFailedEpisode(data) {
    const { rows } = await rssEpisodeRep.updateFailedEpisodeById(data)
    if (rows === 0) {
        throwMessage('Failed.')
    }
}

export async function deleteOneFailedEpisode(failedEpisodeId) {
    const taskExists = await rssEpisodeRep.selectFailedTaskExistsById(failedEpisodeId)
    if (taskExists) {
        throwMessage('Task exists, cannot delete.')
    }
    return rssEpisodeRep.deleteOneFailedById(failedEpisodeId)
}