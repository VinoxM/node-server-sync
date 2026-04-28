import { pushNotification } from "../../../../api/sockets/notification.js"
import { SSH_CMD_BATCH_DELETE_SIMPLE } from "../../../../common/constants/sshScriptsConst.js"
import { dateFormat } from "../../../../common/utils/dateUtil.js"
import { Tracer } from "../../../../core/infra/tracer.js"
import { getSSHExecutor } from "../../../../core/instance/sshExecutor.js"
import {
    MEDIA_BILIVE_FILE_EVENT, MEDIA_BILIVE_RECORD_EVENT_ARRAY,
    MEDIA_BILIVE_RECORD_FILE_STATUS, MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS,
    MEDIA_TYPE_DESCRIPTION,
    MEDIA_VIDEO_MINIO_TYPE
} from "../../constants/mediaConst.js"
import biliveFileRep from "../../repository/bilive/biliveFileRep.js"
import biliveStreamRep from "../../repository/bilive/biliveStreamRep.js"
import videoMinioRep from "../../repository/videoMinioRep.js"
import { createMinioManually } from "../mediaMinioService.js"
import { getBiliveLatestStreamIdBySessionId } from "./biliveSessionService.js"
import { generateVideoStorageFilePath } from "./biliveStreamService.js"

export async function saveBiliveFile(recordId, event, eventTimestamp, eventData) {
    const sessionId = eventData['SessionId']
    const roomId = eventData['RoomId']
    const hostName = eventData['Name']
    const title = eventData['Title']
    const areaNameParent = eventData['AreaNameParent']
    const areaNameChild = eventData['AreaNameChild']
    const filePath = eventData['RelativePath']
    const fileOpenTime = eventData['FileOpenTime']
    if (__isBlank(sessionId)) {
        printAndPushNotificationWarnMessage(`[Bilive File] Dropped empty sessionId event: ${MEDIA_BILIVE_RECORD_EVENT_ARRAY[event] ?? event}. `
            + `Event data: ${JSON.stringify(eventData)}`)
        return
    }
    const file = await biliveFileRep.selectByFilePath(filePath)
    if (MEDIA_BILIVE_FILE_EVENT.FileOpening === event) {
        const streamId = await getBiliveLatestStreamIdBySessionId(sessionId, recordId, roomId, hostName, title, areaNameParent, areaNameChild)
        if (!file) {
            await biliveFileRep.insertFile(sessionId, streamId, title, filePath, tryResolveTime(fileOpenTime ?? eventTimestamp))
        } else {
            __log.warn(`[Bilive File Opening] Found exists file[${file.id}] from repository, update file open time.`)
            await biliveFileRep.updateFileOpenTime(tryResolveTime(fileOpenTime ?? eventTimestamp), file.id)
        }
    } else if (MEDIA_BILIVE_FILE_EVENT.FileClosed === event) {
        const fileSize = eventData['FileSize'] ?? 0
        const fileCloseTime = eventData['FileCloseTime']
        if (!file) {
            printAndPushNotificationWarnMessage(`[Bilive File Closed] Cannot found opening file from repository for file closed event. `
                + `Create a new file record. File path: ${filePath}. `
                + `Event data: ${JSON.stringify(eventData)}`)
            const streamId = await getBiliveLatestStreamIdBySessionId(sessionId, recordId, roomId, hostName, title, areaNameParent, areaNameChild)
            await biliveFileRep.insertFile(sessionId, streamId, title, filePath, tryResolveTime(fileOpenTime), tryResolveTime(fileCloseTime ?? eventTimestamp), fileSize)
        } else {
            await biliveFileRep.updateFileClosed(tryResolveTime(fileCloseTime ?? eventTimestamp), fileSize, file.id)
        }
    }
}

export async function getFilesByStreamId(streamId) {
    const data = await biliveFileRep.selectFilesByStreamId(streamId).then(({ data }) => data)
    return data.map(file => {
        const fileSize = resolveFileSize(file.fileSize)
        return {
            ...file,
            fileSize
        }
    })
}

const CAN_UPLOAD_FILE_STATUS = [
    MEDIA_BILIVE_RECORD_FILE_STATUS.CLOSED
]
const CAN_UPLOAD_FILE_SYNC_STATUS = [
    MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.NOT_SYNCHRONIZED,
    MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZED
]
export async function uploadFileToMediaByFileId(id) {
    const file = await biliveFileRep.selectFileById(id)
    file || __throwMessage('File not found.')
    __log.info(file)
    const { streamId, filePath, fileStatus, syncStatus, startTime } = file
    CAN_UPLOAD_FILE_STATUS.includes(fileStatus) || __throwMessage('Illegal file status, cannot upload.')
    CAN_UPLOAD_FILE_SYNC_STATUS.includes(syncStatus) || __throwMessage('Illegal sync status.')
    const videoId = await biliveStreamRep.selectVideoExistsIdByStreamId(streamId);
    videoId || __throwMessage('Stream video not initialized.')
    if ((await biliveFileRep.updateFileUploading(id))?.rows === 0) {
        __throwMessage('Prepare to upload failed.')
    }
    // upload cover if not exists
    const coverExists = await videoMinioRep.selectMinioExistsByVideoIdAndType(videoId, MEDIA_VIDEO_MINIO_TYPE.COVER)
    if (!coverExists) {
        const cover = generateVideoStorageFilePath(filePath, '.cover.jpg')
        await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.COVER, cover)
    }
    const title = generateStorageTitle(startTime)
    // upload barrage
    const barrage = generateVideoStorageFilePath(filePath, '.xml')
    await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.BARRAGE, barrage, title)
    // upload source
    const source = generateVideoStorageFilePath(filePath, '.flv')
    await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.SOURCE, source, title)
    // setup file uploaded
    await biliveFileRep.updateFileUploaded(id)
}

function generateStorageTitle(startTime) {
    if (!startTime) return null
    try {
        const d = new Date(startTime)
        return dateFormat(d, '[yyyy/MM/dd HH:mm:ss]')
    } catch (error) {
        return null
    }
}

async function uploadVideoStorage(videoId, type, uri, title) {
    const code = await createMinioManually({ videoId, type, uri, title })
    const desc = MEDIA_TYPE_DESCRIPTION[type]
    const message = `Upload ${desc} file to minio ${code ? 'success' : 'timeout'}.`
    const messageType = code ? 'info' : 'warning'
    __log.info(message)
    Tracer.tryStreamMessage(message, `message:${messageType}`)
}

export async function removeFileByFileId(id) {
    const file = await biliveFileRep.selectFileById(id)
    file || __throwMessage('File not found.')
    const { filePath, fileStatus } = file
    MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED === fileStatus && __throwMessage('File has been removed.')
    const cover = generateVideoStorageFilePath(filePath, '.cover.jpg', false)
    const source = generateVideoStorageFilePath(filePath, '.flv', false)
    const barrage = generateVideoStorageFilePath(filePath, '.xml', false)
    await deleteRemoteFiles([cover, source, barrage])
    await biliveFileRep.updateFileRemoved(id)
}

async function deleteRemoteFiles(files) {
    __log.info(`Ready to delete files: `, files)
    const executor = getSSHExecutor('fedora')
    if (!executor) {
        __log.warn(`SSH executor not ready.`)
        return -2
    }
    try {
        const { code } = await executor.exec(SSH_CMD_BATCH_DELETE_SIMPLE, files);
        return parseInt(code)
    } catch (e) {
        __log.error('Execute ssh script failed.', e)
        return -3
    }
}

export async function deleteFile(id) {
    await biliveFileRep.deleteFileById(id);
}

function resolveFileSize(bytes, decimals = 2) {
    if (bytes === null || bytes === undefined) return '-'
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function tryResolveTime(time) {
    try {
        return new Date(time)
    } catch (ignored) {
        return new Date()
    }
}

function printAndPushNotificationWarnMessage(message) {
    __log.warn(message)
    pushNotification(message)
}