import { MEDIA_BILIVE_RECORD_EVENT_TYPE } from '../constants/mediaConst.js'
import biliveRecordRep from '../repository/biliveRecordRep.js'

export async function saveWebhookEvent(body) {
    const { EventType: eventType, EventTimestamp: eventTimestamp, EventId: eventId, EventData: eventData } = body
    const event = MEDIA_BILIVE_RECORD_EVENT_TYPE[eventType]
    const sessionId = eventData['SessionId']
    const roomId = eventData['RoomId']
    const shortId = eventData['ShortId']
    const timestamp = new Date(eventTimestamp)
    const eventDataJson = JSON.stringify(eventData)
    const title = eventData['Title']
    const hostName = eventData['Name']
    __log.info(`[Bilive Record] Received webhook event ${eventType} from ${hostName}(${roomId}) - ${title}, sessionId: ${sessionId}.`)
    await biliveRecordRep.insertOne(event, sessionId, roomId, shortId, timestamp, eventId, eventDataJson)
}