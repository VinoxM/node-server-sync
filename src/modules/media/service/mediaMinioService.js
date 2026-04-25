import path from 'path';
import videoMinioRep from "../repository/videoMinioRep.js";
import { MEDIA_MINIO_STATUS, MEDIA_MINIO_TYPE_MAIN, MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_MINIO_TYPE, MEDIA_VIDEO_STATUS } from "../constants/mediaConst.js";
import videosRep from "../repository/videosRep.js";
import { SSH_CMD_MINIO_COPY_SCRIPT, SSH_CMD_MINIO_DOWNLOAD_SCRIPT } from "../../../common/constants/sshScriptsConst.js";
import { getSSHExecutor } from "../../../core/instance/sshExecutor.js";
import { getMinioClient } from "../../../core/instance/minioClient.js";
import { addTask, removeTask } from "./mediaTaskService.js";
import aria2TaskRep from "../repository/aria2TaskRep.js";
import categoriesRep from '../repository/categoriesRep.js';
import authorsRep from '../repository/authorsRep.js';
import { generateUUID } from '../../../common/utils/cryptoUtil.js';
import { urlContentLengthLargeThanOneMB } from '../../../common/utils/httpUtil.js';
import { executeAsyncTaskChain } from '../../../core/infra/asyncSequence.js';
import { pushNotification } from '../../../api/sockets/notification.js';
import { getMediaUploadTimeoutOption } from './mediaOptionsService.js';

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

const CAN_NOT_CREATE_MINIO_VIDEO_STATUS = [
    MEDIA_VIDEO_STATUS.ANALYZING,
    MEDIA_VIDEO_STATUS.REMOVED
]
export async function createMinioManually(minioObj) {
    const { videoId, type, uri, sort, title } = minioObj
    // validate type
    SUPPORTED_MEDIA_MINIO_TYPE.includes(type) || __throwMessage('Invalid type.')
    // validate video exists
    const videoInfo = await videosRep.selectOne(videoId)
    videoInfo || __throwMessage('Video not exists.')
    // validate minio exists
    const minioExists = await validateMinioExists(videoId, type)
    minioExists && __throwMessage('Minio exists.')
    // validate video status
    const { categoryId, authorId, status } = videoInfo
    CAN_NOT_CREATE_MINIO_VIDEO_STATUS.includes(status) && __throwMessage('Invalid video status, cannot create minio.')
    // validate category exists
    const categoryInfo = await categoriesRep.selectOneById(categoryId)
    categoryInfo || __throwMessage('Category not exists.')
    // validate author exists
    const category = categoryInfo.name
    const authorInfo = await authorsRep.selectOneById(authorId)
    authorInfo || __throwMessage('Author not exists.')
    // resolve uri and create minio
    const author = authorInfo.name
    const uuid = generateUUID()
    const task = await resolveStorageUriWithCreate(uri, videoId, category, author, uuid, type, sort, title)
    if (task === null) {
        // update video minio status
        await updateVideoStatusByVideoMinioStatus(videoId);
        return 1
    } else {        
        const uploadTimeout = await getMediaUploadTimeoutOption()
        __log.info(`uploadTimeout: `, uploadTimeout)
        const { status } = await executeAsyncTaskChain([
            task,
            async () => updateVideoStatusByVideoMinioStatus(videoId)
        ], uploadTimeout)
        return status === 'timeout' ? 0 : 1
    }
}

const MEDIA_MINIO_UNIQUE_TYPE = [MEDIA_VIDEO_MINIO_TYPE.COVER]
async function validateMinioExists(videoId, type) {
    if (MEDIA_MINIO_UNIQUE_TYPE.includes(parseInt(type))) {
        return await videoMinioRep.selectMinioExistsByVideoIdAndType(videoId, type)
    }
    return false
}

const FILE_PROTOCOL = ['file:']
const HTTP_PROTOCOL = ['http:', 'https:']
async function resolveStorageUri(uri, videoId, minioLink, minioId, type) {
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type]
    const resolvedUri = generateUri(uri)
    resolvedUri === null && __throwMessage(`Uri invalid.`)
    const protocol = resolvedUri.protocol
    if (FILE_PROTOCOL.includes(protocol)) {
        // file protocol
        __log.info(`[${videoId}] Video's ${typeDesc} uri is a file, prepare move to minio: ${uri} -> ${minioLink}.`)
        const decodedFilePath = decodeURIComponent(resolvedUri.pathname)
        return async () => uploadFileToMinio(decodedFilePath, minioLink, minioId)
    } else if (HTTP_PROTOCOL.includes(protocol)) {
        // http protocol
        const overSizeOneMB = await urlContentLengthLargeThanOneMB(uri)
        // Get the url file size. 
        // If it cannot be obtained or is larger than 1MB, upload it to aria2 for download. 
        // Otherwise, upload it directly to minio.
        if (overSizeOneMB) {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a large size remote link, add aria2 task for download: ${uri} -> ${minioLink}.`)
            await addTask(uri, minioId, type)
            await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.DOWNLOADING)
        } else {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a tiny remote link, upload uri to minio: ${uri} -> ${minioLink}.`)
            return async () => {
                const complete = await uploadUrlToMinio(uri, minioLink, minioId)
                if (!complete) {
                    __log.info(`[${videoId}] Video's ${typeDesc} upload to minio failed, add aria2 task for download: ${uri} -> ${minioLink}.`)
                    await addTask(uri, minioId, type)
                    await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.DOWNLOADING)
                }
            }
        }
    } else {
        const message = `[${videoId}] Cannot resolve video ${typeDesc} uri: ${uri}`
        __log.warn(message)
        pushNotification(message)
        await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.FAILED)
    }
    return null
}

export async function resolveStorageUriWithCreate(uri = '', videoId, category, author, uuid, type, sort, title) {
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type]
    const resolvedUri = generateUri(uri)
    if (resolvedUri === null) {
        __log.warn(`[${videoId}] Skipped resolve video ${typeDesc}, cause uri invalid. ${uri}`)
        return null;
    }
    // generate minioLink
    const ext = path.extname(resolvedUri.pathname)
    const minioLink = generateMinioLink(category, author, uuid, type, ext)
    sort ??= await videoMinioRep.selectMaxSortOfType(videoId, type).then(s => s + 1);
    // save minio
    const { rows, lastId } = await videoMinioRep.insertOne({ videoId, type, uri, link: minioLink, status: MEDIA_MINIO_STATUS.PREPARED, title, sort })
    if (rows === 0) {
        __log.error(`Resolve video minio failed, cause unique(${videoId}, ${type}) exists.`)
        __throwMessage(`Resolve video ${typeDesc} minio failed.`)
    }
    // update video minio id
    if (MEDIA_MINIO_TYPE_MAIN.includes(parseInt(type))) {
        await videosRep.updateMinioIdById(videoId, lastId, type)
    }
    return resolveStorageUri(uri, videoId, minioLink, lastId, type)
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
    __throwMessage(message)
}

export async function updateVideoStatusByVideoMinioStatus(videoId) {
    const videoStatus = await videosRep.updateVideoStatus(videoId)
    if (videoStatus === MEDIA_VIDEO_STATUS.PREPARED) {
        __log.warn(`[${videoId}] Video minio not found, setup video status to prepared.`)
    } else if (videoStatus === MEDIA_VIDEO_STATUS.UPLOADING) {
        __log.info(`[${videoId}] Video minio any resolving, setup video status to uploading.`)
    } else if (videoStatus === MEDIA_VIDEO_STATUS.COMPLETE) {
        __log.info(`[${videoId}] Video minio all resolved, setup video status to complete.`)
    }
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
    const client = getMinioClient()
    if (!client?.ready()) {
        logAndPushNotification(`Upload minio object failed. Cause client not ready.`)
        return -1
    }
    const suitableMinioLink = client.generateSuitableMinioLink(minioLink);
    const executor = getSSHExecutor('fedora')
    if (!executor) return -2
    try {
        const { code } = await executor.exec(script, [resourcePath, suitableMinioLink]);
        return parseInt(code)
    } catch (e) {
        __log.error('Execute ssh script failed.', e)
        return -3
    }
}

const CAN_UPDATE_MINIO_ORIGIN_URI_STATUS = [MEDIA_MINIO_STATUS.FAILED]
export async function updateMinioOriginUri(minioId, originUri) {
    const minioInfo = await videoMinioRep.selectOneById(minioId)
    minioInfo || __throwMessage('Video minio not found.')
    const { status } = minioInfo
    CAN_UPDATE_MINIO_ORIGIN_URI_STATUS.includes(status) || __throwMessage('Cannot update minio origin uri.')
    await videoMinioRep.updateOriginUriById(originUri, minioId)
}

export async function retryMinio(minioId) {
    const result = await videoMinioRep.selectOneById(minioId)
    result || __throwMessage('Minio not found.')
    const { id, videoId, originUri, type, status, link } = result
    status !== MEDIA_MINIO_STATUS.FAILED && __throwMessage('Minio can not retry.')
    const aria2Tasks = await aria2TaskRep.selectByMinioId(minioId).then(({ data }) => data)
    __isNotEmptyArray(aria2Tasks) && __throwMessage('Minio can not retry, cause aria2 task exists in this minio.')
    // resolve origin uri
    const task = await resolveStorageUri(originUri, videoId, link, id, type)
    if (task === null) {
        // update video status
        await updateVideoStatusByVideoMinioStatus(videoId)
        return 1
    } else {
        // execute async task chain
        const uploadTimeout = await getMediaUploadTimeoutOption()
        const { status } = await executeAsyncTaskChain([
            task,
            async () => updateVideoStatusByVideoMinioStatus(videoId)
        ], uploadTimeout)
        return status === 'timeout' ? 0 : 1
    }
}

export async function updateMinioTitleAndSort(body) {
    const { id, title, sort = 0 } = body
    await videoMinioRep.updateTitleAndSortById(title, sort, id)
}

/** 
 * Minio management: DELETE
 */
const CANT_NOT_DELETE_MINIO_STATUS = [
    MEDIA_MINIO_STATUS.UPLOADING
]
export async function deleteVideoMinio(minioId, safely = false) {
    const minioInfo = await videoMinioRep.selectOneById(minioId)
    if (!minioInfo) return;
    const { id, link, status } = minioInfo
    safely && CANT_NOT_DELETE_MINIO_STATUS.includes(status) && __throwMessage('Minio can not delete.')
    const { rows } = await videoMinioRep.updateStatusById(id, MEDIA_MINIO_STATUS.REMOVED)
    const aria2Tasks = await aria2TaskRep.selectByMinioId(minioId).then(({ data }) => data)
    if (__isNotEmptyArray(aria2Tasks)) {
        safely && __throwMessage('Minio can not delete, cause aria2 task exists in this minio.')
        for (const { id } of aria2Tasks) {
            await removeTask(id);
        }
    }
    if (rows > 0) {
        __log.info(`[${id}] Ready to remove minio.`)
        if (__isNotBlank(link)) {
            const minioDeleted = await deleteMinioAndObject(link, id)
            minioDeleted || __throwMessage(`Minio object delete failed.`)
        }
    }
    await videoMinioRep.deleteByMinioId(id)
}

async function deleteMinioAndObject(minioLink, minioId) {
    __log.info(`[${minioId}] Ready to delete minio object: ${minioLink}`)
    const client = getMinioClient()
    if (!client?.ready()) {
        logAndPushNotification(`Delete minio object failed. Cause client not ready.`)
        return false;
    }
    return client.deleteObject(minioLink, err => logAndPushNotification(err.message ?? 'Unknown minio error.', minioId))
}

function logAndPushNotification(message, minioId) {
    const msg = (__isNotBlank(minioId) ? `[${minioId}] ` : '') + `${message}`
    __log.error(msg)
    pushNotification(msg)
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
    const minioBucket = getMinioBucketByCategory(category)
    minioBucket || __throwMessage('Unable to find a suitable category of bucket.')
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type]
    return `/${minioBucket}/${category}/${author}/${typeDesc}:${uniqueId}${ext}`
}

function getMinioBucketByCategory(category) {
    const client = getMinioClient()
    client.ready() || __throwMessage('Minio not ready.')
    return client.generateSuitableMinioBucket(category)
}

export function getMinioClientMatchers() {
    const client = getMinioClient()
    client.ready() || __throwMessage('Minio not ready.')
    return client.getMinioMatchers()
}

export function generateMinioSourceSafely(minioLink) {
    const client = getMinioClient()
    if (client?.ready?.()) {
        const clientMatchers = client.getMinioMatchers() || []
        for (const label in clientMatchers) {
            const { matcher, hostname } = clientMatchers[label];
            try {
                if (new RegExp(matcher).test(source)) {
                    return `http://${hostname}${source}`
                }
            } catch (ex) {
            }
        }
    }
    return `https://minio-api-media.vinoxm.name${minioLink}`
}