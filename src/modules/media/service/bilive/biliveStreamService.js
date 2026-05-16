import { MEDIA_BILIVE_RECORD_FILE_STATUS, MEDIA_BILIVE_STREAM_EVENT, MEDIA_BILIVE_STREAM_STATUS } from "../../constants/mediaConst.js"
import biliveStreamRep from '../../repository/bilive/biliveStreamRep.js'
import { biliveApi } from "./biliveApiService.js"
import { pushNotification } from "../../../../api/sockets/notification.js"
import { createVideo } from "../mediaVideoService.js"
import biliveFileRep from "../../repository/bilive/biliveFileRep.js"
import path from 'path'
import videosRep from "../../repository/videosRep.js"
import categoriesRep from "../../repository/categoriesRep.js"
import videoTagMapRep from "../../repository/videoTagMapRep.js"
import { getPushNotificationWhenBiliveStreamChanged } from "../mediaOptionsService.js"
import { dateFormat } from "../../../../common/utils/dateUtil.js"

export function getBiliveRecordFileSavePath() {
    return __env.get('bilive.record.savePath', '/mnt/storage-0/bilive/recording')
}

async function tryGetRoomInfo(roomId) {
    __log.debug(`[Bilive Stream] Try get bilive room info, roomId: ${roomId}`)
    try {
        const data = await biliveApi.getRoomInfo(roomId)
        if (data) {
            const isLiving = data?.['live_status'] === 1
            const startTime = isLiving && data?.['live_time'] !== '0000-00-00 00:00:00' ? new Date(data?.['live_time']) : null
            const hostName = 'UID::' + data?.uid
            const title = data?.title ?? ''
            const areaNameParent = data?.['parent_area_name']
            const areaNameChild = data?.['area_name']
            __log.debug(`[Bilive Stream] Room ${isLiving ? 'streaming' : 'not stream'}. [${roomId}] ${title}`)
            return {
                roomId,
                isLiving,
                startTime,
                hostName,
                title,
                areaNameParent,
                areaNameChild,
                originData: data
            }
        }
    } catch (ex) {
    }
    __log.debug(`[Bilive Stream] Get bilive room info failed, roomId: ${roomId}`)
    return null;
}

const MAX_BILIVE_START_TIME_GAP = 60 * 1000
function checkStartTime(startTimeFromApi, startTimeFromBilive) {
    const time1 = startTimeFromApi ? new Date(startTimeFromApi).getTime() : MAX_BILIVE_START_TIME_GAP * -1
    const time2 = startTimeFromBilive ? new Date(startTimeFromBilive).getTime() : MAX_BILIVE_START_TIME_GAP
    __log.debug(`[Bilive Stream] Try compare stream start time, from api: ${time1}, from repository: ${time2}`)
    return Math.abs(time1 - time2) < MAX_BILIVE_START_TIME_GAP
}

async function createStartStream(roomInfo, hostName) {
    return biliveStreamRep.insertStartStream(
        roomInfo.roomId,
        hostName ?? roomInfo.hostName,
        roomInfo.title,
        roomInfo.areaNameParent,
        roomInfo.areaNameChild,
        roomInfo.startTime)
}

export async function getBiliveLatestStreamingId(recordId, roomId, hostName, title, areaNameParent, areaNameChild) {
    __log.debug(`[Bilive Stream] Try get room's[${roomId}] latest streaming id.`)
    const latestStream = await biliveStreamRep.selectLatestStreamingByRoomId(roomId)
    const roomInfo = await tryGetRoomInfo(roomId)
    if (latestStream) {
        if (roomInfo) {
            if (!roomInfo.isLiving && latestStream.streaming === MEDIA_BILIVE_STREAM_STATUS.READY_TO_ENDED) {
                await biliveStreamRep.updateStreamEndedById(latestStream.id)
                return latestStream.id
            } else if (__env.isDev() || checkStartTime(roomInfo.startTime, latestStream.startTime)) {
                __log.debug(`[Bilive Stream] Room's[${roomId}] latest streaming id found.`)
                return latestStream.id
            } else {
                const endMessage = `Latest streaming start time not equals bilive start time, `
                    + `setup latest stream ended and create a non start time streaming record.`
                __log.warn(`[Bilive Stream] ${endMessage}`)
                const endReason = endMessage + `Bilive api origin data: ${JSON.stringify(roomInfo?.originData ?? {})}`
                await biliveStreamRep.updateStreamEndedById(latestStream.id, null, recordId, endReason)
                const res = await createStartStream(roomInfo, hostName)
                return res.lastId
            }
        } else {
            printAndPushNotificationWarnMessage(`[Bilive Stream] Cannot get room's[${roomId}] stream start time from bilive api, `
                + `return latest stream from repository.`)
            return latestStream.id
        }
    } else {
        if (roomInfo) {
            printAndPushNotificationWarnMessage(`[Bilive Stream] Cannot found room's[${roomId}] latest streaming from repository,`
                + `create new streaming record by bilive api information.`)
            const res = await createStartStream(roomInfo, hostName)
            return res.lastId
        } else {
            printAndPushNotificationWarnMessage(`[Bilive Stream] Cannot found room's[${roomId}] latest streaming from repository and bilive api,`
                + `create a non start time streaming record by bilive record event data.`)
            const res = await biliveStreamRep.insertStartStream(roomId, hostName, title, areaNameParent, areaNameChild)
            return res.lastId
        }
    }
}

export async function saveBiliveStream(recordId, event, eventTimestamp, eventData) {
    const roomId = eventData['RoomId']
    const hostName = eventData['Name']
    const title = eventData['Title']
    const areaNameParent = eventData['AreaNameParent']
    const areaNameChild = eventData['AreaNameChild']
    const timestamp = tryResolveTime(eventTimestamp)
    if (MEDIA_BILIVE_STREAM_EVENT.StreamStarted === event) {
        await tryNotifyBiliveStreamChanged(hostName, title, timestamp, 1)
        const latestStream = await biliveStreamRep.insertStartStream(roomId, hostName, title, areaNameParent, areaNameChild, timestamp)
        __log.info(`[Bilive Stream Started] Setup latest stream[${latestStream.lastId}] started.`)
    } else if (MEDIA_BILIVE_STREAM_EVENT.StreamEnded === event) {
        await tryNotifyBiliveStreamChanged(hostName, title, timestamp, 0)
        const latestStream = await biliveStreamRep.selectLatestStreamingByRoomId(roomId)
        if (latestStream) {
            if (latestStream.streaming === MEDIA_BILIVE_STREAM_STATUS.STREAMING) {
                await biliveStreamRep.updateStreamReadyToEndedById(latestStream.id, timestamp, recordId, 'Normally.')
                __log.info(`[Bilive Stream Ended] Setup latest stream[${latestStream.id}] ready to ended.`)
            } else {
                await biliveStreamRep.updateStreamEndedById(latestStream.id, timestamp, recordId, 'Directly.')
                __log.info(`[Bilive Stream Ended] Setup latest stream[${latestStream.id}] ended.`)
            }
        } else {
            const { lastId } = await biliveStreamRep.insertStartStream(roomId, hostName, title, areaNameParent, areaNameChild, null, timestamp)
            await biliveStreamRep.updateStreamEndedById(lastId, timestamp, recordId, 'Latest stream info not found.')
            __log.warn(`[Bilive Stream Ended] Latest stream info not found. Create a non start time stream record.`)
        }
    }
}

async function tryNotifyBiliveStreamChanged(hostName, title, timestamp, isStarted) {
    try {
        const f = await getPushNotificationWhenBiliveStreamChanged()
        f && pushNotification(`[Bilive Stream ${isStarted ? 'Started' : 'Ended'}] [${dateFormat(tryResolveTime(timestamp))}] ${hostName}: ${title}`)
    } catch (ex) {
        __log.error(`Try notify bilive stream changed failed. Cause: `, ex.message)
    }
}

export async function searchStream(roomId, hostName, pageSize = 10, pageNum = 1) {
    const record = await biliveStreamRep.selectStreamForSearch(roomId, hostName, pageSize, pageNum).then(({ data }) => data)
    const total = await biliveStreamRep.selectStreamForSearchCount(roomId, hostName)
    return { record, total, pageNum, pageSize }
}

export async function getStreamEndedRecordEventData(streamId) {
    const data = await biliveStreamRep.selectEndedEventDataById(streamId)
    return data ? {
        ...data,
        eventData: JSON.parse(data.eventData)
    } : null
}

export async function initStreamVideo(streamId, tags) {
    const stream = await biliveStreamRep.selectOneById(streamId)
    stream || __throwMessage('Stream not found.')
    const { title, hostName, startTime, videoId } = stream;
    const video = await videosRep.selectOne(videoId, true)
    if (!video) {
        const category = __env.get('bilive.uploadCategory', 'record')
        const firstFile = await biliveFileRep.selectFirstFileByStreamId(streamId)
        if (!firstFile || firstFile.fileStatus !== MEDIA_BILIVE_RECORD_FILE_STATUS.CLOSED) {
            __throwMessage('No valid files were available.')
        }
        const { filePath } = firstFile;
        const cover = generateVideoStorageFilePath(filePath)
        const video = await createVideo({ title, author: hostName, category, uploadTime: tryResolveTime(startTime), cover, tags })
        await biliveStreamRep.updateVideoIdById(video.id, streamId)
        return video.id
    }
    return videoId;
}

export async function getBiliveRecordTags() {
    const categoryName = __env.get('bilive.uploadCategory', 'record')
    const category = await categoriesRep.selectOneByName(categoryName)
    if (!category) return []
    return videoTagMapRep.selectTagsWithCount(category.id).then(({ data }) => data)
}

export function generateVideoStorageFilePath(filePath, ext = '.cover.jpg', withProtocol = true) {
    const recordFileSavePath = getBiliveRecordFileSavePath()
    const fileName = path.basename(filePath, path.extname(filePath))
    return (withProtocol ? 'file://' : '') + path.join(recordFileSavePath, path.dirname(filePath), fileName) + ext
}

export async function deleteStream(streamId) {
    const firstFile = await biliveFileRep.selectFirstFileByStreamId(streamId)
    firstFile && __throwMessage('Cannot delete stream cause file exists in this stream.')
    await biliveStreamRep.deleteStreamById(streamId);
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