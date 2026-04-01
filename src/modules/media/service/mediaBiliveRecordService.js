import path from 'path'
import { MEDIA_BILIVE_RECORD_EVENT_TYPE } from '../constants/mediaConst.js'
import biliveRecordRep from '../repository/biliveRecordRep.js'
import { dateFormat } from '../../../common/utils/dateUtil.js'

export async function saveWebhookEvent(body) {
    const { EventType: eventType, EventTimestamp: eventTimestamp, EventId: eventId, EventData: eventData } = body
    if (!Object.keys(MEDIA_BILIVE_RECORD_EVENT_TYPE).includes(eventType)) {
        __log.warn(`[Bilive Record] Dropped not supported webhook event ${eventType}. Body data: `, body)
        return;
    }
    const event = MEDIA_BILIVE_RECORD_EVENT_TYPE[eventType]
    const sessionId = eventData['SessionId']
    if (__isBlank(sessionId)) {
        __log.error(`[Bilive Record] Dropped empty SessionId webhook event ${eventType}. Body data: `, body)
        return;
    }
    const roomId = eventData['RoomId']
    const shortId = eventData['ShortId']
    const timestamp = new Date(eventTimestamp)
    const eventDataJson = JSON.stringify(eventData)
    const title = eventData['Title']
    const hostName = eventData['Name']
    __log.info(`[Bilive Record] Received webhook event ${eventType} from ${hostName}(${roomId}) - ${title}, sessionId: ${sessionId}.`)
    const exists = await biliveRecordRep.selectSessionExists(sessionId)
    if (!exists) {
        const { rows } = await biliveRecordRep.insertSession(sessionId, eventTimestamp, roomId, hostName)
        rows > 0 && __log.info(`[Bilive Record] Session ${sessionId} not exists, saved session.`)
    } else if (event === MEDIA_BILIVE_RECORD_EVENT_TYPE.SessionEnded) {
        await biliveRecordRep.updateSessionEndTime(sessionId, eventTimestamp)
    }
    await biliveRecordRep.insertOneEvent(event, sessionId, roomId, shortId, timestamp, eventId, eventDataJson)
}

export async function getEventSessions(currentPage, pageSize) {
    const result = {
        list: [],
        totalSize: 0,
        currentPage,
        pageSize
    }
    const { rows, data: sessions } = await biliveRecordRep.selectSessions(currentPage, pageSize)
    result.totalSize = await biliveRecordRep.selectSessionsTotal()
    if (rows === 0) return result;
    for (const session of sessions) {
        const sessionData = { files: [], ...session }
        result.list.push(sessionData)
        const { data: records } = await biliveRecordRep.selectEventsBySessionId(session.sessionId)
        if (__isEmptyArray(records)) continue;
        const files = new Map()
        for (const record of records) {
            const { event, eventTimestamp, eventData } = record
            if (event === MEDIA_BILIVE_RECORD_EVENT_TYPE.SessionStarted) {
                sessionData.startTime ??= eventTimestamp
                sessionData.hostName ??= JSON.parse(eventData ?? '{}')?.Name
            }
            if (event === MEDIA_BILIVE_RECORD_EVENT_TYPE.SessionEnded) {
                sessionData.endTime ??= eventTimestamp
                sessionData.hostName ??= JSON.parse(eventData ?? '{}')?.Name
            }
            if (event === MEDIA_BILIVE_RECORD_EVENT_TYPE.FileOpening) {
                const eventObj = JSON.parse(eventData ?? '{}')
                sessionData.hostName ??= eventObj?.Name
                const filePath = eventObj?.RelativePath
                if (__isNotBlank(filePath)) {
                    files.has(filePath) || files.set(filePath, {})
                    const file = files.get(filePath)
                    file.openTime = eventTimestamp
                }
            }
            if (event === MEDIA_BILIVE_RECORD_EVENT_TYPE.FileClosed) {
                const eventObj = JSON.parse(eventData ?? '{}')
                sessionData.hostName ??= eventObj?.Name
                const filePath = eventObj?.RelativePath
                if (__isNotBlank(filePath)) {
                    files.has(filePath) || files.set(filePath, {})
                    const file = files.get(filePath)
                    file.closeTime = eventTimestamp
                }
            }
        }
        files.forEach((val, key) => sessionData.files?.push({ filePath: key, title: resolveFileTitle(key), ...val }))
        sessionData.files.sort((a, b) => {
            if (!__isAnyBlank(a.openTime, b.openTime)) {
                return a.openTime - b.openTime
            } else if (!__isAnyBlank(a.closeTime, b.closeTime)) {
                return a.closeTime - b.closeTime
            }
            return 0
        })
    }
    return result
}

function resolveFileTitle(filePath) {
    const basename = path.basename(filePath, path.extname(filePath))
    const split = basename.split('-')
    const datetime = formatDateTime(split[2], split[3])
    const title = basename.replace(split.slice(0, 5).join('-') + '-', '')
    return `[${datetime}] ${title}`
}

function formatDateTime(dStr, tStr) {
    const y = dStr.substring(0, 4),
        m = dStr.substring(4, 6),
        d = dStr.substring(6, 8),
        hh = tStr.substring(0, 2),
        mm = tStr.substring(2, 4),
        ss = tStr.substring(4, 6);
    return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
}

export async function uploadRecord(body) {

}