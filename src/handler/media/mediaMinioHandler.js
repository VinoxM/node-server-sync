import videoMinioRep from "../../repository/media/videoMinioRep.js";
import { pushNotification } from "../../sockets/notification.js";
import { MEDIA_MINIO_STATUS, MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_STATUS } from "../../constraints/mediaConst.js";
import videosRep from "../../repository/media/videosRep.js";
import { SSH_CMD_MINIO_COPY_SCRIPT, SSH_CMD_MINIO_DOWNLOAD_SCRIPT } from "../../constraints/sshScriptsConst.js";
import { getExecutor } from "../sshHandler.js";
import { getMinioClient } from "../../instance/minio.js";
import { addAria2Task, deleteArai2Tasks } from "./mediaAria2Handler.js";

const CAN_UPDATE_MEDIA_MINIO_STATUS = [MEDIA_MINIO_STATUS.COMPLETE, MEDIA_MINIO_STATUS.FAILED]

export function generateMinioLink(category, author, uniqueId, type, ext) {
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type]
    return `/media/${category}/${author}/${typeDesc}:${uniqueId}${ext}`
}

/**
 * Add video step2 from status: UPLOADING
 * Minio status:
 * UPLOADING -> COMPLETE/FAILED
 */
export async function updateMinioStatus(id, status) {
    const minioStatus = parseInt(status)
    // validate minio status
    CAN_UPDATE_MEDIA_MINIO_STATUS.includes(minioStatus) || notifyUpdateMediaMinioStatusFailed('Invalid media minio status.', id)

    const videoMinio = await videoMinioRep.selectOneById(id)
    videoMinio || notifyUpdateMediaMinioStatusFailed('Media minio not exists.', id)
    const videoId = videoMinio.videoId

    // save minio
    const { rows } = await videoMinioRep.updateStatusById(id, minioStatus)
    rows > 0 || notifyUpdateMediaMinioStatusFailed('Save media minio status failed.', id)

    await updateVideoStatusByVideoMinioStatus(videoId)
}

function notifyUpdateMediaMinioStatusFailed(message, id) {
    pushNotification(`Update media minio[${id}] status failed: ${message}`)
    throwMessage(message)
}

export async function updateVideoStatusByVideoMinioStatus(videoId) {
    const result = await videoMinioRep.selectMaxStatusByVideoId(videoId)
    if (!result) {
        __log.warn(`[${videoId}] Video minio not founed, setup video status to prepared.`)
        await videosRep.updateVideoStatus(videoId, MEDIA_VIDEO_STATUS.PREPARED)
        return
    }
    const { minStatus, maxStatus } = result
    if (CAN_UPDATE_MEDIA_MINIO_STATUS.includes(minStatus) && CAN_UPDATE_MEDIA_MINIO_STATUS.includes(maxStatus)) {
        __log.info(`[${videoId}] Video minio all resolved, setup video status to complete.`)
        await videosRep.updateVideoStatus(videoId, MEDIA_VIDEO_STATUS.COMPLETE)
    }
}

export async function retryMinio(minioId) {
    const result = await videoMinioRep.selectOneById(minioId)
    result || throwMessage('Minio not found.')
    const { originUri, type } = result
    await addAria2Task(originUri, minioId, type)
    await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.DOWNLOADING)
}

/**
 * Add video step1 from status: ANALYSING.
 * Minio status:
 * COMPLETE/FAILED
 */
export async function uploadFileToMinio(filePath, minioLink, lastId) {
    const result = await uploadToMinio(filePath, minioLink, SSH_CMD_MINIO_COPY_SCRIPT)
    const complete = result === 1
    const minioStatus = complete ? MEDIA_MINIO_STATUS.COMPLETE : MEDIA_MINIO_STATUS.FAILED
    lastId && await videoMinioRep.updateStatusById(lastId, minioStatus)
    return complete
}

/**
 * Add video step1 from status: ANALYSING.
 * Minio status:
 * COMPLETE/FAILED
 */
export async function uploadUrlToMinio(url, minioLink, lastId) {
    const result = await uploadToMinio(url, minioLink, SSH_CMD_MINIO_DOWNLOAD_SCRIPT)
    const complete = result === 1
    const minioStatus = complete ? MEDIA_MINIO_STATUS.COMPLETE : MEDIA_MINIO_STATUS.FAILED
    lastId && await videoMinioRep.updateStatusById(lastId, minioStatus)
    return complete
}

async function uploadToMinio(resourcePath, minioLink, script) {
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

export async function removeVideoMinio(videoId) {
    const result = await videoMinioRep.selectByVideoId(videoId)
    if (!result) return
    const { data } = result
    const toRemoveIds = []
    for (const { id, link, status } of data) {
        if (status === MEDIA_MINIO_STATUS.COMPLETE && isNotBlank(link)) {
            await deleteMinioObject(link, id)
        }
        toRemoveIds.push(id)
    }
    await videoMinioRep.updateStatusByIds(toRemoveIds, MEDIA_MINIO_STATUS.REMOVED)
    await deleteArai2Tasks(toRemoveIds)
}

async function deleteMinioObject(minioLink, minioId) {
    let link = String(minioLink)
    if (link.startsWith('/')) {
        link = link.slice(1)
    }
    const index = link.indexOf('/')
    if (index === -1) {
        logAndPushNotification(`[${minioId}] Invalid episode minio link: ${minioLink}`)
        return
    }
    const bucket = link.substring(0, index)
    const objectName = link.substring(index + 1)
    const client = getMinioClient()
    if (!client?.ready()) {
        logAndPushNotification(`[${minioId}] Delete minio object failed. Cuase client not ready.`)
        return
    }
    await client.deleteObject(bucket, objectName)
}

function logAndPushNotification(message) {
    __log.error(message)
    pushNotification(message)
}