import path from 'path';
import videoMinioRep from "../../repository/media/videoMinioRep.js";
import { pushNotification } from "../../sockets/notification.js";
import { MEDIA_MINIO_STATUS, MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_MINIO_TYPE, MEDIA_VIDEO_STATUS } from "../../constraints/mediaConst.js";
import videosRep from "../../repository/media/videosRep.js";
import { SSH_CMD_MINIO_COPY_SCRIPT, SSH_CMD_MINIO_DOWNLOAD_SCRIPT } from "../../constraints/sshScriptsConst.js";
import { getExecutor } from "../sshHandler.js";
import { getMinioClient } from "../../instance/minio.js";
import { addAria2Task } from "./mediaAria2Handler.js";
import aria2TaskRep from "../../repository/media/aria2TaskRep.js";
import categoriesRep from '../../repository/media/categoriesRep.js';
import authorsRep from '../../repository/media/authorsRep.js';
import { generateUUID } from '../../common/stringUtil.js';
import { urlContentLengthLargeThanOneMB } from '../../common/httpUtil.js';
import { executeAsyncTaskChain } from '../../instance/asyncExecutor.js';

const SUPPORTED_MEDIA_MINIO_TYPE = Object.values(MEDIA_VIDEO_MINIO_TYPE)

export async function searchMinio(videoId) {
    const minioList = await videoMinioRep.selectByVideoId(videoId).then(({ data }) => data)
    if (Array.isArray(minioList)) {
        for (let i = 0; i < minioList.length; i++) {
            const minio = minioList[i];
            minio.tasks = await aria2TaskRep.selectByMinioId(minio.id).then(({ data }) => data)
        }
    }
    return minioList;
}

export async function createMinioManually(minioObj) {
    const { videoId, type, uri } = minioObj
    // validate type
    SUPPORTED_MEDIA_MINIO_TYPE.includes(type) || throwMessage('Invalid type.')
    // validate minio exists
    const minioExists = await videoMinioRep.selectOneByVideoIdAndType(videoId, type)
    minioExists && throwMessage('Minio exists.')
    // validate video exists
    const videoInfo = await videosRep.selectOne(videoId)
    videoInfo || throwMessage('Video not exists.')
    // validate video status
    const { categoryId, authorId, status } = videoInfo
    MEDIA_VIDEO_STATUS.ANALYZING === status && throwMessage('Video is analyzing, cannot create minio.')
    // validate category exists
    const categoryInfo = await categoriesRep.selectOneById(categoryId)
    categoryInfo || throwMessage('Category not exists.')
    // validate author exists
    const category = categoryInfo.name
    const authorInfo = await authorsRep.selectOneById(authorId)
    authorInfo || throwMessage('Author not exists.')
    // resolve uri and create minio
    const author = authorInfo.name
    const uuid = generateUUID()
    await executeAsyncTaskChain([
        async () => resolveVideoUri(uri, videoId, category, author, uuid, type),
        // update video minio status
        async () => updateVideoStatusByVideoMinioStatus(videoId)
    ], 30000)
}

const FILE_PROTOCOL = ['file:']
const HTTP_PROTOCOL = ['http:', 'https:']
export async function resolveVideoUri(uri = '', videoId, category, author, uuid, type) {
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type]
    const resolvedUri = generateUri(uri)
    if (resolvedUri === null) {
        __log.warn(`[${videoId}] Skipped resolve video ${typeDesc}, cause uri invalid. ${uri}`)
        return;
    }
    // generate minioLink
    const ext = path.extname(resolvedUri.pathname)
    const minioLink = generateMinioLink(category, author, uuid, type, ext)
    // save minio
    const { rows, lastId } = await videoMinioRep.insertOne({ videoId, type, uri, link: minioLink, status: MEDIA_MINIO_STATUS.PREPARED })
    if (rows === 0) {
        __log.error(`Resolve video minio failed, cause unique(${videoId}, ${type}) exists.`)
        throwMessage(`Resolve video ${typeDesc} minio failed.`)
    }
    // update video minio id
    await videosRep.updateMinioIdById(videoId, lastId, type)
    const protocol = resolvedUri.protocol
    if (FILE_PROTOCOL.includes(protocol)) {
        // file protocol
        __log.info(`[${videoId}] Video's ${typeDesc} uri is a file, prepare move to minio: ${uri} -> ${minioLink}.`)
        await uploadFileToMinio(decodeURIComponent(resolvedUri.pathname), minioLink, lastId)
    } else if (HTTP_PROTOCOL.includes(protocol)) {
        // http protocol
        const overSizeOneMB = await urlContentLengthLargeThanOneMB(uri)
        // Get the url file size. 
        // If it cannot be obtained or is larger than 1MB, upload it to aria2 for download. 
        // Otherwise, upload it directly to minio.
        if (overSizeOneMB) {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a large size remote link, add aria2 task for download: ${uri} -> ${minioLink}.`)
            await addAria2Task(uri, lastId, type)
            await videoMinioRep.updateStatusById(lastId, MEDIA_MINIO_STATUS.DOWNLOADING)
        } else {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a tiny remote link, upload uri to minio: ${uri} -> ${minioLink}.`)
            const complete = await uploadUrlToMinio(uri, minioLink, lastId)
            if (!complete) {
                __log.info(`[${videoId}] Video's ${typeDesc} upload to minio failed, add aria2 task for download: ${uri} -> ${minioLink}.`)
                await addAria2Task(uri, lastId, type)
                await videoMinioRep.updateStatusById(lastId, MEDIA_MINIO_STATUS.DOWNLOADING)
            }
        }
    } else {
        const message = `[${videoId}] Cannot resolve video ${typeDesc} uri: ${uri}`
        __log.warn(message)
        pushNotification(message)
        await videoMinioRep.updateStatusById(lastId, MEDIA_MINIO_STATUS.FAILED)
    }
    return true
}

/**
 * Add video step2 from status: UPLOADING
 * Minio status:
 * UPLOADING -> COMPLETE/FAILED
 */
const CAN_UPDATE_MEDIA_MINIO_STATUS = [MEDIA_MINIO_STATUS.COMPLETE, MEDIA_MINIO_STATUS.FAILED]
export async function updateMinioStatus(id, status) {
    const minioStatus = parseInt(status)
    // validate minio status
    CAN_UPDATE_MEDIA_MINIO_STATUS.includes(minioStatus) || notifyUpdateMediaMinioStatusFailed('Invalid media minio status.', id)
    // validate minio exists
    const videoMinio = await videoMinioRep.selectOneById(id)
    videoMinio || notifyUpdateMediaMinioStatusFailed('Media minio not exists.', id)
    const videoId = videoMinio.videoId
    // save minio
    const { rows } = await videoMinioRep.updateStatusById(id, minioStatus)
    rows > 0 || notifyUpdateMediaMinioStatusFailed('Save media minio status failed.', id)
    // update video status
    await updateVideoStatusByVideoMinioStatus(videoId)
}

function notifyUpdateMediaMinioStatusFailed(message, id) {
    pushNotification(`Update media minio[${id}] status failed: ${message}`)
    throwMessage(message)
}

export async function updateVideoStatusByVideoMinioStatus(videoId) {
    const { total, complete } = await videoMinioRep.selectMinioCompleteByVideoId(videoId)
    let videoStatus = 0;
    if (total === 0) {
        __log.warn(`[${videoId}] Video minio not found, setup video status to prepared.`)
        videoStatus = MEDIA_VIDEO_STATUS.PREPARED
    } else if (complete) {
        __log.info(`[${videoId}] Video minio all resolved, setup video status to complete.`)
        videoStatus = MEDIA_VIDEO_STATUS.COMPLETE
    } else {
        __log.info(`[${videoId}] Video minio any resolving, setup video status to uploading.`)
        videoStatus = MEDIA_VIDEO_STATUS.UPLOADING
    }
    await videosRep.updateVideoStatus(videoId, videoStatus)
    return videoStatus
}

/**
 * Add video step1 from status: ANALYZING.
 * Minio status:
 * COMPLETE/FAILED
 */
async function uploadFileToMinio(filePath, minioLink, lastId) {
    await videoMinioRep.updateStatusById(lastId, MEDIA_MINIO_STATUS.UPLOADING)
    const result = await executeSshScript(filePath, minioLink, SSH_CMD_MINIO_COPY_SCRIPT)
    const complete = result === 1
    const minioStatus = complete ? MEDIA_MINIO_STATUS.COMPLETE : MEDIA_MINIO_STATUS.FAILED
    await videoMinioRep.updateStatusById(lastId, minioStatus)
    return complete
}

/**
 * Add video step1 from status: ANALYZING.
 * Minio status:
 * COMPLETE/FAILED
 */
async function uploadUrlToMinio(url, minioLink, lastId) {
    const result = await executeSshScript(url, minioLink, SSH_CMD_MINIO_DOWNLOAD_SCRIPT)
    const complete = result === 1
    const minioStatus = complete ? MEDIA_MINIO_STATUS.COMPLETE : MEDIA_MINIO_STATUS.FAILED
    await videoMinioRep.updateStatusById(lastId, minioStatus)
    return complete
}

async function executeSshScript(resourcePath, minioLink, script) {
    const executor = getExecutor('fedora')
    if (!executor) return -2
    try {
        const { code } = await executor.exec(script, [resourcePath, minioLink]);
        return parseInt(code)
    } catch (e) {
        __log.error('Execute ssh script failed.', e)
        return -3
    }
}

const CAN_UPDATE_MINIO_ORIGIN_URI_STATUS = [MEDIA_MINIO_STATUS.FAILED]
export async function updateMinioOriginUri(minioId, originUri) {
    const minioInfo = await videoMinioRep.selectOneById(minioId)
    minioInfo || throwMessage('Video minio not found.')
    const { status } = minioInfo
    CAN_UPDATE_MINIO_ORIGIN_URI_STATUS.includes(status) || throwMessage('Cannot update minio origin uri.')
    await videoMinioRep.updateOriginUriById(minioId, originUri)
}

export async function retryMinio(minioId) {
    const result = await videoMinioRep.selectOneById(minioId)
    result || throwMessage('Minio not found.')
    const { originUri, type, status } = result
    status !== MEDIA_MINIO_STATUS.FAILED && throwMessage('Minio can not retry.')
    const aria2Tasks = await aria2TaskRep.selectByMinioId(minioId).then(({ data }) => data)
    isNotEmptyArray(aria2Tasks) && throwMessage('Minio can not retry, cause aria2 task exists in this minio.')
    await addAria2Task(originUri, minioId, type)
    await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.DOWNLOADING)
}

/** 
 * Minio management: DELETE
 */
export async function deleteVideoMinio(minioId) {
    const minioInfo = await videoMinioRep.selectOneById(minioId)
    if (!minioInfo) return;
    const aria2Tasks = await aria2TaskRep.selectByMinioId(minioId).then(({ data }) => data)
    isNotEmptyArray(aria2Tasks) && throwMessage('Minio can not delete, cause aria2 task exists in this minio.')
    const { id, link } = minioInfo
    const { rows } = await videoMinioRep.updateStatusById(id, MEDIA_MINIO_STATUS.REMOVED)
    if (rows > 0) {
        __log.info(`[${id}] Ready to remove minio.`)
        if (isNotBlank(link)) {
            await deleteMinioAndObject(link, id)
        }
    }
    await videoMinioRep.deleteByMinioId(id)
}

async function deleteMinioAndObject(minioLink, minioId) {
    __log.info(`[${minioId}] Ready to delete minio object: ${minioLink}`)
    let link = String(minioLink)
    if (link.startsWith('/')) {
        link = link.slice(1)
    }
    const index = link.indexOf('/')
    if (index === -1) {
        logAndPushNotification(`[${minioId}] Invalid minio link: ${minioLink}`)
        return
    }
    const bucket = link.substring(0, index)
    const objectName = link.substring(index + 1)
    const client = getMinioClient()
    if (!client?.ready()) {
        logAndPushNotification(`[${minioId}] Delete minio object failed. Cause client not ready.`)
        return
    }
    await client.deleteObject(bucket, objectName)
}

function logAndPushNotification(message) {
    __log.error(message)
    pushNotification(message)
}

/** Support functions */
function generateUri(uri) {
    try {
        return new URL(uri)
    } catch (ignored) {
        return null
    }
}

function generateMinioLink(category, author, uniqueId, type, ext) {
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type]
    return `/media/${category}/${author}/${typeDesc}:${uniqueId}${ext}`
}