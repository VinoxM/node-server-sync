import { pushNotification } from "../../../../api/sockets/notification.js"
import { MEDIA_BILIVE_RECORD_EVENT_ARRAY, MEDIA_BILIVE_RECORD_EVENT_TYPE } from "../../constants/mediaConst.js"
import biliveSessionRep from "../../repository/bilive/biliveSessionRep.js"
import { getBiliveLatestStreamingId } from "./biliveStreamService.js"

export async function getBiliveLatestStreamIdBySessionId(sessionId, recordId, roomId, hostName, title, areaNameParent, areaNameChild) {
    __log.debug(`[Bilive Session] Try to get room's[${roomId}] bilive latest streamId by sessionId: ${sessionId}`)
    const existsSession = await biliveSessionRep.selectBySessionId(sessionId)
    if (existsSession) {
        __log.debug(`[Bilive Session] Room's[${roomId}] bilive latest session founded. SessionId: ${sessionId}`)
        return existsSession.streamId
    }
    __log.warn(`[Bilive Session] Cannot found opening session from repository. Create a non start time session. SessionId: ${sessionId}`)
    const streamId = await getBiliveLatestStreamingId(recordId, roomId, hostName, title, areaNameParent, areaNameChild)
    const { rows } = await biliveSessionRep.insertSession(sessionId, streamId, roomId)
    if (rows === 0) {
        __log.warn(`[Bilive Session] Insert a non start time session failed. Cause session exists. SessionId: ${sessionId}`)
        return (await biliveSessionRep.selectBySessionId(sessionId))?.streamId
    }
    return streamId
}

export async function saveBiliveSession(recordId, event, eventTimestamp, eventData) {
    const timestamp = tryResolveTime(eventTimestamp)
    const sessionId = eventData['SessionId']
    const roomId = eventData['RoomId']
    const hostName = eventData['Name']
    const title = eventData['Title']
    const areaNameParent = eventData['AreaNameParent']
    const areaNameChild = eventData['AreaNameChild']
    if (__isBlank(sessionId)) {
        printAndPushNotificationWarnMessage(`[Bilive Session] Dropped empty sessionId event: ${MEDIA_BILIVE_RECORD_EVENT_ARRAY[event] ?? event}. Event data: ${JSON.stringify(eventData)}`)
        return
    }
    const streamId = await getBiliveLatestStreamingId(recordId, roomId, hostName, title, areaNameParent, areaNameChild)
    if (MEDIA_BILIVE_RECORD_EVENT_TYPE.SessionStarted === event) {
        const { rows } = await biliveSessionRep.insertSession(sessionId, streamId, roomId, timestamp)
        if (rows === 0) {
            __log.warn(`[Bilive Session Started] Save session started failed, Cause exists. Update exists session start time. SessionId: ${sessionId}`)
            if ((await biliveSessionRep.updateSessionStarted(sessionId, timestamp))?.rows === 0) {
                __log.warn(`[Bilive Session Started] Update exists session start time failed. Cause start time not null. SessionId: ${sessionId}`)
            }
        }
    } else if (MEDIA_BILIVE_RECORD_EVENT_TYPE.SessionEnded === event) {
        const session = await biliveSessionRep.selectBySessionId(sessionId)
        if (!session) {
            printAndPushNotificationWarnMessage(`[Bilive Session Ended] Cannot found opening session from repository for session ended event. Create a non start time session. `
                + `SessionId: ${sessionId}, Event data: ${JSON.stringify(eventData)}`)
            await biliveSessionRep.insertSession(sessionId, streamId, roomId, null, timestamp)
        } else {
            await biliveSessionRep.updateSessionEnded(sessionId, timestamp)
        }
    }
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