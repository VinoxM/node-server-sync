import {
    MEDIA_BILIVE_FILE_EVENT, MEDIA_BILIVE_RECORD_EVENT_ARRAY,
    MEDIA_BILIVE_RECORD_EVENT_TYPE, MEDIA_BILIVE_SESSION_EVENT,
    MEDIA_BILIVE_STREAM_EVENT
} from '../constants/mediaConst.js'
import { saveBiliveStream } from './bilive/biliveStreamService.js'
import { saveBiliveSession } from './bilive/biliveSessionService.js'
import { saveBiliveFile } from './bilive/biliveFileService.js'
import biliveRecordRep from '../repository/bilive/biliveRecordRep.js'

const BILIVE_RECORD_STREAM_EVENT_ARRAY = Object.values(MEDIA_BILIVE_STREAM_EVENT)
const BILIVE_RECORD_SESSION_EVENT_ARRAY = Object.values(MEDIA_BILIVE_SESSION_EVENT)
const BILIVE_RECORD_FILE_EVENT_ARRAY = Object.values(MEDIA_BILIVE_FILE_EVENT)

export async function saveWebhookEvent(body) {
    const { EventType: eventType, EventTimestamp: eventTimestamp, EventId: eventId, EventData: eventData } = body
    if (!MEDIA_BILIVE_RECORD_EVENT_ARRAY.includes(eventType)) {
        __log.warn(`[Bilive Record] Dropped not supported webhook event ${eventType}. Body data: `, body)
        return;
    }
    const event = MEDIA_BILIVE_RECORD_EVENT_TYPE[eventType]
    const sessionId = eventData['SessionId'] ?? ''
    const roomId = eventData['RoomId']
    const timestamp = new Date(eventTimestamp)
    const eventDataJson = JSON.stringify(eventData)
    const title = eventData['Title']
    const hostName = eventData['Name']
    __log.info(`[Bilive Record] Received webhook event ${eventType} from ${hostName}(${roomId}) - ${title}, sessionId: ${sessionId || '-'}.`)
    // save event data
    const record = await biliveRecordRep.insertOneEvent(event, sessionId, roomId, timestamp, eventId, eventDataJson)
    // save stream event data
    BILIVE_RECORD_STREAM_EVENT_ARRAY.includes(event) && await saveBiliveStream(record.lastId, event, eventTimestamp, eventData)
    // save session event data
    BILIVE_RECORD_SESSION_EVENT_ARRAY.includes(event) && await saveBiliveSession(record.lastId, event, eventTimestamp, eventData)
    // save file event data
    BILIVE_RECORD_FILE_EVENT_ARRAY.includes(event) && await saveBiliveFile(record.lastId, event, eventTimestamp, eventData)
}