import { MEDIA_BILIVE_RECORD_FILE_STATUS, MEDIA_BILIVE_STREAM_EVENT, MEDIA_BILIVE_STREAM_STATUS } from "../../constants/mediaConst.js";
import biliveStreamRep from '../../repository/bilive/biliveStreamRep.js';
import { biliveApi } from "./biliveApiService.js";
import { pushNotification } from "#api/sockets/notification.js";
import { createVideo } from "../mediaVideoService.js";
import biliveFileRep from "../../repository/bilive/biliveFileRep.js";
import path from 'path';
import videosRep from "../../repository/videosRep.js";
import categoriesRep from "../../repository/categoriesRep.js";
import videoTagMapRep from "../../repository/videoTagMapRep.js";
import { getPushNotificationWhenBiliveStreamChanged } from "../mediaOptionsService.js";
import { dateFormat } from "#utils/dateUtil.js";
import { uploadFileToMediaByFileId } from "./biliveFileService.js";
import { Tracer } from "#core/infra/tracer.js";
import { GetterContextSubscribe } from "#core/context/subscribe.js";

/**
 * 获取 B站录制文件在本地主机的挂载保存基础路径
 * @returns {string}
 */
export function getBiliveRecordFileSavePath() {
    return __env.get('bilive.record.savePath', '/mnt/storage-0/bilive/recording');
}

/**
 * 尝试通过 B站官方 API 拉取直播间最新开播状态与标题
 * @param {string|number} roomId - 直播间 ID
 * @returns {Promise<{ roomId: string|number, isLiving: boolean, startTime: Date|null, hostName: string, title: string, areaNameParent: string, areaNameChild: string, originData: any }|null>}
 */
async function tryGetRoomInfo(roomId) {
    __log.debug(`[Bilive Stream] Try get bilive room info, roomId: ${roomId}`);
    try {
        const data = await biliveApi.getRoomInfo(roomId);
        if (data) {
            const isLiving = data?.['live_status'] === 1;
            const startTime = isLiving && data?.['live_time'] !== '0000-00-00 00:00:00' ? new Date(data?.['live_time']) : null;
            const hostName = 'UID::' + data?.uid;
            const title = data?.title ?? '';
            const areaNameParent = data?.['parent_area_name'];
            const areaNameChild = data?.['area_name'];
            __log.debug(`[Bilive Stream] Room ${isLiving ? 'streaming' : 'not stream'}. [${roomId}] ${title}`);
            return {
                roomId,
                isLiving,
                startTime,
                hostName,
                title,
                areaNameParent,
                areaNameChild,
                originData: data
            };
        }
    } catch (ex) {
    }
    __log.debug(`[Bilive Stream] Get bilive room info failed, roomId: ${roomId}`);
    return null;
}

const MAX_BILIVE_START_TIME_GAP = 60 * 1000;
function checkStartTime(startTimeFromApi, startTimeFromBilive) {
    const time1 = startTimeFromApi ? new Date(startTimeFromApi).getTime() : MAX_BILIVE_START_TIME_GAP * -1;
    const time2 = startTimeFromBilive ? new Date(startTimeFromBilive).getTime() : MAX_BILIVE_START_TIME_GAP;
    __log.debug(`[Bilive Stream] Try compare stream start time, from api: ${time1}, from repository: ${time2}`);
    return Math.abs(time1 - time2) < MAX_BILIVE_START_TIME_GAP;
}

async function createStartStream(roomInfo, hostName) {
    return biliveStreamRep.insertStartStream(
        roomInfo.roomId,
        hostName ?? roomInfo.hostName,
        roomInfo.title,
        roomInfo.areaNameParent,
        roomInfo.areaNameChild,
        roomInfo.startTime);
}

/**
 * 获取或动态推导创建当前正在推流的直播流记录 ID
 * @param {number} recordId - bilive_record 主键 ID
 * @param {string|number} roomId - 直播间 ID
 * @param {string} hostName - 主播名
 * @param {string} title - 直播间标题
 * @param {string} areaNameParent - 父分区
 * @param {string} areaNameChild - 子分区
 * @returns {Promise<number>} 直播流 ID
 */
export async function getBiliveLatestStreamingId(recordId, roomId, hostName, title, areaNameParent, areaNameChild) {
    __log.debug(`[Bilive Stream] Try get room's[${roomId}] latest streaming id.`);
    const latestStream = await biliveStreamRep.selectLatestStreamingByRoomId(roomId);
    const roomInfo = await tryGetRoomInfo(roomId);
    if (latestStream) {
        if (roomInfo) {
            if (!roomInfo.isLiving && latestStream.streaming === MEDIA_BILIVE_STREAM_STATUS.READY_TO_ENDED) {
                await biliveStreamRep.updateStreamEndedById(latestStream.id);
                return latestStream.id;
            } else if (__env.isDev() || checkStartTime(roomInfo.startTime, latestStream.startTime)) {
                __log.debug(`[Bilive Stream] Room's[${roomId}] latest streaming id found.`);
                return latestStream.id;
            } else {
                const endMessage = `Latest streaming start time not equals bilive start time, `
                    + `setup latest stream ended and create a non start time streaming record.`;
                __log.warn(`[Bilive Stream] ${endMessage}`);
                const endReason = endMessage + `Bilive api origin data: \n${JSON.stringify(roomInfo?.originData ?? {}, null, 4)}`;
                await biliveStreamRep.updateStreamEndedById(latestStream.id, null, recordId, endReason);
                const res = await createStartStream(roomInfo, hostName);
                return res.lastId;
            }
        } else {
            printAndPushNotificationWarnMessage(`[Bilive Stream] Cannot get room's[${roomId}] stream start time from bilive api, `
                + `return latest stream from repository.`);
            return latestStream.id;
        }
    } else {
        if (roomInfo) {
            printAndPushNotificationWarnMessage(`[Bilive Stream] Cannot found room's[${roomId}] latest streaming from repository,`
                + `create new streaming record by bilive api information.`);
            const res = await createStartStream(roomInfo, hostName);
            return res.lastId;
        } else {
            printAndPushNotificationWarnMessage(`[Bilive Stream] Cannot found room's[${roomId}] latest streaming from repository and bilive api,`
                + `create a non start time streaming record by bilive record event data.`);
            const res = await biliveStreamRep.insertStartStream(roomId, hostName, title, areaNameParent, areaNameChild);
            return res.lastId;
        }
    }
}

/**
 * 直播推流启停事件处理（开播 StreamStarted、关播 StreamEnded）
 * @param {number} recordId - bilive_record 主键 ID
 * @param {number} event - 事件类型 (MEDIA_BILIVE_STREAM_EVENT)
 * @param {string} eventTimestamp - 事件时间戳
 * @param {Record<string, any>} eventData - Webhook 事件数据
 * @returns {Promise<void>}
 */
export async function saveBiliveStream(recordId, event, eventTimestamp, eventData) {
    const roomId = eventData['RoomId'];
    const hostName = eventData['Name'];
    const title = eventData['Title'];
    const areaNameParent = eventData['AreaNameParent'];
    const areaNameChild = eventData['AreaNameChild'];
    const timestamp = tryResolveTime(eventTimestamp);
    if (MEDIA_BILIVE_STREAM_EVENT.StreamStarted === event) {
        await tryNotifyBiliveStreamChanged(hostName, title, timestamp, 1);
        const latestStream = await biliveStreamRep.insertStartStream(roomId, hostName, title, areaNameParent, areaNameChild, timestamp);
        __log.info(`[Bilive Stream Started] Setup latest stream[${latestStream.lastId}] started.`);
    } else if (MEDIA_BILIVE_STREAM_EVENT.StreamEnded === event) {
        await tryNotifyBiliveStreamChanged(hostName, title, timestamp, 0);
        const latestStream = await biliveStreamRep.selectLatestStreamingByRoomId(roomId);
        if (latestStream) {
            if (latestStream.streaming === MEDIA_BILIVE_STREAM_STATUS.STREAMING) {
                await biliveStreamRep.updateStreamReadyToEndedById(latestStream.id, timestamp, recordId, 'Normally.');
                __log.info(`[Bilive Stream Ended] Setup latest stream[${latestStream.id}] ready to ended.`);
            } else {
                await biliveStreamRep.updateStreamEndedById(latestStream.id, timestamp, recordId, 'Directly.');
                __log.info(`[Bilive Stream Ended] Setup latest stream[${latestStream.id}] ended.`);
            }
        } else {
            const { lastId } = await biliveStreamRep.insertStartStream(roomId, hostName, title, areaNameParent, areaNameChild, null, timestamp);
            await biliveStreamRep.updateStreamEndedById(lastId, timestamp, recordId, 'Latest stream info not found.');
            __log.warn(`[Bilive Stream Ended] Latest stream info not found. Create a non start time stream record.`);
        }
    }
}

async function tryNotifyBiliveStreamChanged(hostName, title, timestamp, isStarted) {
    try {
        const f = await getPushNotificationWhenBiliveStreamChanged();
        f && pushNotification(`[Bilive Stream ${isStarted ? 'Started' : 'Ended'}] [${dateFormat(tryResolveTime(timestamp))}] ${hostName}: ${title}`);
    } catch (ex) {
        __log.error(`Try notify bilive stream changed failed. Cause: `, ex.message);
    }
}

/**
 * 分页检索直播推流历史记录
 * @param {string|number} [roomId] - 直播间 ID
 * @param {string} [hostName] - 主播名称模糊搜索
 * @param {number} [pageSize=10] - 每页条数
 * @param {number} [pageNum=1] - 当前页码
 * @returns {Promise<{ record: any[], total: number, pageNum: number, pageSize: number }>}
 */
export async function searchStream(roomId, hostName, pageSize = 10, pageNum = 1) {
    const record = await biliveStreamRep.selectStreamForSearch(roomId, hostName, pageSize, pageNum).then(({ data }) => data);
    const total = await biliveStreamRep.selectStreamForSearchCount(roomId, hostName);
    return { record, total, pageNum, pageSize };
}

/**
 * 获取关播事件原始载荷明细
 * @param {number} streamId - 直播流 ID
 * @returns {Promise<any>}
 */
export async function getStreamEndedRecordEventData(streamId) {
    const data = await biliveStreamRep.selectEndedEventDataById(streamId);
    return data ? {
        ...data,
        eventData: JSON.parse(data.eventData)
    } : null;
}

/**
 * 将直播流初始化为一条媒体视频记录 (videos 表)
 * @param {number} streamId - 直播流 ID
 * @param {string[]} [tags] - 初始绑定的标签列表
 * @param {boolean} [executeAsync=true] - 是否异步执行资源解析
 * @returns {Promise<number>} 生成的视频 ID
 */
export async function initStreamVideo(streamId, tags, executeAsync = true) {
    const stream = await biliveStreamRep.selectOneById(streamId);
    stream || __throwMessage('Stream not found.');
    const { title, hostName, startTime, videoId } = stream;
    const video = await videosRep.selectOne(videoId, true);
    if (!video) {
        const category = __env.get('bilive.uploadCategory', 'record');
        const firstFile = await biliveFileRep.selectFirstFileByStreamId(streamId);
        if (!firstFile || firstFile.fileStatus !== MEDIA_BILIVE_RECORD_FILE_STATUS.CLOSED) {
            __throwMessage('No valid files were available.');
        }
        const { filePath } = firstFile;
        const cover = generateVideoStorageFilePath(filePath);
        const video = await createVideo({ title, author: hostName, category, uploadTime: tryResolveTime(startTime), cover, tags }, executeAsync);
        await biliveStreamRep.updateVideoIdById(video.id, streamId);
        return video.id;
    }
    return videoId;
}

/**
 * 获取录制分类下的常用标签及使用频次
 * @returns {Promise<any[]>}
 */
export async function getBiliveRecordTags() {
    const categoryName = __env.get('bilive.uploadCategory', 'record');
    const category = await categoriesRep.selectOneByName(categoryName);
    if (!category) return [];
    return videoTagMapRep.selectTagsWithCount(category.id).then(({ data }) => data);
}

/**
 * 生成录制切片衍生资源（封面、弹幕、转码MP4等）的文件路径
 * @param {string} filePath - 原始切片相对路径
 * @param {string} [ext='.cover.jpg'] - 目标扩展后缀
 * @param {boolean} [withProtocol=true] - 是否带 file:// 协议前缀
 * @returns {string} 绝对路径
 */
export function generateVideoStorageFilePath(filePath, ext = '.cover.jpg', withProtocol = true) {
    const recordFileSavePath = getBiliveRecordFileSavePath();
    const fileName = path.basename(filePath, path.extname(filePath));
    return (withProtocol ? 'file://' : '') + path.join(recordFileSavePath, path.dirname(filePath), fileName) + ext;
}

/**
 * 删除指定的推流记录（需确保不存在未删除的录制切片文件）
 * @param {number} streamId - 直播流 ID
 * @returns {Promise<void>}
 */
export async function deleteStream(streamId) {
    const firstFile = await biliveFileRep.selectFirstFileByStreamId(streamId);
    firstFile && __throwMessage('Cannot delete stream cause file exists in this stream.');
    await biliveStreamRep.deleteStreamById(streamId);
}

/**
 * 将准备下播 (READY_TO_ENDED) 的推流手动置为关播 (NOT_LIVE)
 * @param {number} streamId - 直播流 ID
 * @returns {Promise<void>}
 */
export async function closeReadyToEndStream(streamId) {
    await biliveStreamRep.updateReadyToEndStreamEndedById(streamId);
}

/**
 * 自动扫描已关播且未完成同步的直播流并触发同步任务流
 * @returns {Promise<void>}
 */
export async function autoSyncStreams() {
    const { rows, data: streams } = await biliveStreamRep.selectNotLiveStreamForAutoSync();
    if (rows === 0) return;
    for (const stream of streams) {
        await syncStreamToMediaStorage(stream.id);
    }
}

/**
 * 执行单条直播流向媒体 MinIO 存储的全量自动上传同步任务
 * @param {number} streamId - 直播流 ID
 * @returns {Promise<void>}
 */
export async function syncStreamToMediaStorage(streamId) {
    const stream = await biliveStreamRep.selectOneById(streamId);
    stream || __throwMessage('Bilive stream not exists.');
    const { id, hostName, title, startTime, endTime } = stream;
    printAndTryStreamEvenMessage(`[Stream Sync:${id}] Ready to sync stream to media storage. [${hostName}] ${title} {${dateFormat(new Date(startTime))} - ${dateFormat(new Date(endTime))}`);
    const rows = await biliveStreamRep.updateStreamToSync(id);
    if (rows === 0) {
        printAndTryStreamEvenMessage(`[Stream Sync:${id}] Setup stream status to autoSync failed. Skipped.`, 'warning');
        return;
    }
    try {
        const tags = generateStreamTags(hostName);
        await initStreamVideo(id, tags, false);
        const { rows, data: files } = await biliveFileRep.selectFilesByStreamId(id);
        if (rows === 0) {
            printAndTryStreamEvenMessage(`[Stream Sync:${id}] Stream files empty. Skipped.`, 'warning');
            return;
        }
        for (const file of files) {
            const canContinue = await tryUploadStreamFile(file.id, id);
            if (!canContinue) {
                printAndTryStreamEvenMessage(`[Stream Sync:${id}] Upload stream file interrupted. Skipped stream sync.`, 'warning');
                break;
            }
        }
    } catch (ex) {
        printAndTryStreamEvenMessage(`[Stream Sync:${id}] Sync stream to storage failed. Cause:${ex?.msg || ex?.message || ex}`, 'error');
    } finally {
        printAndTryStreamEvenMessage(`[Stream Sync:${id}] Sync stream to media storage finished, backup stream status to notLive.`);
        await biliveStreamRep.updateStreamNotLiveFromSync(id);
    }
}

async function tryUploadStreamFile(fileId, streamId) {
    try {
        const ensure = await biliveStreamRep.ensureSyncStream(streamId);
        ensure || __throwMessage('Illegal Stream status.');
        await uploadFileToMediaByFileId(fileId, true, false);
        return true;
    } catch (ex) {
        printAndTryStreamEvenMessage(`[Stream Sync:${streamId}] Upload stream file[${fileId}] to storage failed. Cause:${ex?.msg || ex?.message || ex}`, 'error');
        return false;
    }
}

const tagMappingGetter = new GetterContextSubscribe("BiliveStreamTagMapping", () => __env.get('bilive.tagMapping', []));
function generateStreamTags(hostName) {
    const tagMapping = tagMappingGetter.getValue();
    if (__isNotEmptyArray(tagMapping)) {
        const mapping = tagMapping.find(t => t.hostName === hostName);
        return mapping?.tags ?? [];
    }
    return [];
}

/**
 * 手动停止某条直播流的自动同步状态并恢复为未开播 (NOT_LIVE)
 * @param {number} id - 直播流 ID
 * @returns {Promise<void>}
 */
export async function stopAutoSync(id) {
    await biliveStreamRep.updateStreamNotLiveFromSync(id);
}

function tryResolveTime(time) {
    try {
        return new Date(time);
    } catch (ignored) {
        return new Date();
    }
}

function printAndTryStreamEvenMessage(message, messageType = '') {
    Tracer.tryStreamMessage(message, `message${__isNotBlank(messageType) ? (':' + messageType) : ''}`);
    if (messageType === 'warning') {
        __log.warn(message);
    } else if (messageType === 'error') {
        __log.error(message);
    } else {
        __log.info(message);
    }
}

function printAndPushNotificationWarnMessage(message) {
    __log.warn(message);
    pushNotification(message);
}