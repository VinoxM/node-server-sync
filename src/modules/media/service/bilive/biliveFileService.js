import { pushNotification } from "../../../../api/sockets/notification.js"
import { MEDIA_BILIVE_FILE_EVENT, MEDIA_BILIVE_RECORD_EVENT_ARRAY } from "../../constants/mediaConst.js"
import biliveFileRep from "../../repository/bilive/biliveFileRep.js"
import { getBiliveLatestStreamIdBySessionId } from "./biliveSessionService.js"

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
    if (MEDIA_BILIVE_FILE_EVENT.FileOpening === event) {
        const streamId = await getBiliveLatestStreamIdBySessionId(sessionId, recordId, roomId, hostName, title, areaNameParent, areaNameChild)
        await biliveFileRep.insertFile(sessionId, streamId, title, filePath, tryResolveTime(fileOpenTime ?? eventTimestamp))
    } else if (MEDIA_BILIVE_FILE_EVENT.FileClosed === event) {
        const fileSize = eventData['FileSize'] ?? 0
        const fileCloseTime = eventData['FileCloseTime']
        const file = await biliveFileRep.selectByFilePath(filePath)
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

export async function uploadFileToMediaByFileId(id) {
    
}

async function uploadFileToMedia(file) {
    const {} = file
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