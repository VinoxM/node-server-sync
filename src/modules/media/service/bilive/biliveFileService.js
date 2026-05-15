import path from "path"
import { pushNotification } from "../../../../api/sockets/notification.js"
import { dateFormat } from "../../../../common/utils/dateUtil.js"
import { formatFileSize } from "../../../../common/utils/humanUtil.js"
import { Tracer } from "../../../../core/infra/tracer.js"
import { convertFlvToMp4, removeRemoteFiles } from "../../../ssh/sshExecutorService.js"
import {
    MEDIA_BILIVE_FILE_EVENT, MEDIA_BILIVE_RECORD_EVENT_ARRAY,
    MEDIA_BILIVE_RECORD_FILE_STATUS, MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS,
    MEDIA_TYPE_DESCRIPTION,
    MEDIA_VIDEO_MINIO_TYPE
} from "../../constants/mediaConst.js"
import biliveFileRep from "../../repository/bilive/biliveFileRep.js"
import biliveStreamRep from "../../repository/bilive/biliveStreamRep.js"
import videoMinioRep from "../../repository/videoMinioRep.js"
import { createMinioManually, validateVideoStatusCanNotCreateMinio } from "../mediaMinioService.js"
import { getConvertBiliveStreamFileFlvToMp4Option, getMediaAutoDeleteStreamFile, getMediaUploadTimeoutOption } from "../mediaOptionsService.js"
import { getBiliveLatestStreamIdBySessionId } from "./biliveSessionService.js"
import { generateVideoStorageFilePath } from "./biliveStreamService.js"
import { executeAsyncTaskChain } from "../../../../core/infra/asyncSequence.js"

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
        const fileSize = formatFileSize(file.fileSize)
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
    const { streamId, filePath, fileStatus, syncStatus, startTime } = file
    CAN_UPLOAD_FILE_STATUS.includes(fileStatus) || __throwMessage('Illegal file status, cannot upload.')
    CAN_UPLOAD_FILE_SYNC_STATUS.includes(syncStatus) || __throwMessage('Illegal sync status.')
    const video = await biliveStreamRep.selectExistsVideoByStreamId(streamId);
    video || __throwMessage('Stream video not initialized.')
    const { videoId, status: videoStatus } = video
    validateVideoStatusCanNotCreateMinio(videoStatus)
    if ((await biliveFileRep.updateFileUploading(id))?.rows === 0) {
        __throwMessage('Prepare to upload failed.')
    }
    try {
        // upload cover if not exists
        const coverExists = await videoMinioRep.selectMinioExistsByVideoIdAndType(videoId, MEDIA_VIDEO_MINIO_TYPE.COVER)
        const uploadCallback = await initUploadStorageCallback(coverExists ? 2 : 3, id);
        if (!coverExists) {
            const cover = generateVideoStorageFilePath(filePath, '.cover.jpg')
            await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.COVER, cover, null, uploadCallback)
        }
        const title = generateStorageTitle(startTime)
        // upload barrage
        const barrage = generateVideoStorageFilePath(filePath, '.xml')
        await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.BARRAGE, barrage, title, uploadCallback)
        // upload source
        const source = generateVideoStorageFilePath(filePath, '.flv')
        const convertBiliveStreamFileFlvToMp4 = await getConvertBiliveStreamFileFlvToMp4Option();
        if (convertBiliveStreamFileFlvToMp4) {
            const uploadTimeout = await getMediaUploadTimeoutOption()
            await executeAsyncTaskChain([
                async () => {
                    const convertedSource = await tryConvertFlvToMp4(source)
                    await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.SOURCE, convertedSource, title, uploadCallback)
                }
            ], uploadTimeout)
        } else {
            await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.SOURCE, source, title, uploadCallback)
        }
    } finally {
        // setup file uploaded
        await biliveFileRep.updateFileUploaded(id)
    }
}

async function initUploadStorageCallback(triggerSuccessCount, fileId) {
    const flag = await getMediaAutoDeleteStreamFile()
    if (!flag) return null
    let successCount = 0;
    let triggered = false;
    return async (uploadComplete) => {
        if (!triggered && uploadComplete) {
            successCount++;
            if (successCount >= triggerSuccessCount) {
                triggered = true;
                __log.info('All files upload complete, ready to remove files.')
                await removeFileByFileId(fileId);
            }
        }
    }
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

async function tryConvertFlvToMp4(fileUri) {
    const FILE_PROTOCOL = 'file://'
    let fullFilePath = fileUri
    if (fileUri.startsWith(FILE_PROTOCOL)) {
        fullFilePath = fileUri.substring(FILE_PROTOCOL.length)
    }
    const ext = path.extname(fullFilePath)
    if (ext === '.flv') {
        const mp4FilePath = fullFilePath.substring(0, fullFilePath.length - 4) + '.mp4'
        __log.info(`[BiliveFile] Ready to convert flv file to mp4: ${fullFilePath} -> ${mp4FilePath}`)
        const convertResult = await convertFlvToMp4(fullFilePath, mp4FilePath)
        if (convertResult === 0) {
            __log.info(`[BiliveFile] Convert flv file to mp4 success: ${mp4FilePath}.`)
            return FILE_PROTOCOL + mp4FilePath
        } else {
            __log.error(`[BiliveFile] Convert flv file to mp4 failed.`)
            __throwMessage(`Convert flv file to mp4 failed.`)
        }
    }
    return fileUri;
}

async function uploadVideoStorage(videoId, type, uri, title, uploadCallback) {
    const code = await createMinioManually({ videoId, type, uri, title }, uploadCallback)
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
    const barrage = generateVideoStorageFilePath(filePath, '.xml', false)
    const source = generateVideoStorageFilePath(filePath, '.flv', false)
    const mp4Source = generateVideoStorageFilePath(filePath, '.mp4', false)
    await removeRemoteFiles([cover, source, barrage, mp4Source])
    await biliveFileRep.updateFileRemoved(id)
}

export async function deleteFile(id) {
    await biliveFileRep.deleteFileById(id);
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