import path from "path";
import { pushNotification } from "#api/sockets/notification.js";
import { dateFormat } from "#utils/dateUtil.js";
import { formatFileSize } from "#utils/humanUtil.js";
import { Tracer } from "#core/infra/tracer.js";
import { convertFlvToMp4, removeRemoteFiles } from "../../../ssh/sshExecutorService.js";
import {
    MEDIA_BILIVE_FILE_EVENT, MEDIA_BILIVE_RECORD_EVENT_ARRAY,
    MEDIA_BILIVE_RECORD_FILE_STATUS, MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS,
    MEDIA_BILIVE_STREAM_STATUS,
    MEDIA_TYPE_DESCRIPTION,
    MEDIA_VIDEO_MINIO_TYPE
} from "../../constants/mediaConst.js";
import biliveFileRep from "../../repository/bilive/biliveFileRep.js";
import biliveStreamRep from "../../repository/bilive/biliveStreamRep.js";
import videoMinioRep from "../../repository/videoMinioRep.js";
import { createMinioManually, validateVideoStatusCanNotCreateMinio } from "../mediaMinioService.js";
import { getConvertBiliveStreamFileFlvToMp4Option, getMediaAutoDeleteStreamFile, getMediaUploadTimeoutOption } from "../mediaOptionsService.js";
import { getBiliveLatestStreamIdBySessionId } from "./biliveSessionService.js";
import { generateVideoStorageFilePath } from "./biliveStreamService.js";
import { executeAsyncTaskChain } from "#core/infra/asyncSequence.js";

/**
 * 录制切片文件生命周期事件回调（文件打开 FileOpening、文件关闭 FileClosed）
 * @param {number} recordId - bilive_record 主键 ID
 * @param {number} event - 事件类型 (MEDIA_BILIVE_FILE_EVENT)
 * @param {string} eventTimestamp - 事件时间戳
 * @param {Record<string, any>} eventData - Webhook 事件数据
 * @returns {Promise<void>}
 */
export async function saveBiliveFile(recordId, event, eventTimestamp, eventData) {
    const sessionId = eventData['SessionId'];
    const roomId = eventData['RoomId'];
    const hostName = eventData['Name'];
    const title = eventData['Title'];
    const areaNameParent = eventData['AreaNameParent'];
    const areaNameChild = eventData['AreaNameChild'];
    const filePath = eventData['RelativePath'];
    const fileOpenTime = eventData['FileOpenTime'];
    if (__isBlank(sessionId)) {
        printAndPushNotificationWarnMessage(`[Bilive File] Dropped empty sessionId event: ${MEDIA_BILIVE_RECORD_EVENT_ARRAY[event] ?? event}. `
            + `Event data: ${JSON.stringify(eventData)}`);
        return;
    }
    const file = await biliveFileRep.selectByFilePath(filePath);
    if (MEDIA_BILIVE_FILE_EVENT.FileOpening === event) {
        const streamId = await getBiliveLatestStreamIdBySessionId(sessionId, recordId, roomId, hostName, title, areaNameParent, areaNameChild);
        if (!file) {
            const { rows } = await biliveFileRep.insertFile(sessionId, streamId, title, filePath, tryResolveTime(fileOpenTime ?? eventTimestamp));
            if (rows > 0) return;
        }
        __log.warn(`[Bilive File Opening] Found exists file[${file?.id}] from repository, update file open time.`);
        file && await biliveFileRep.updateFileOpenTime(tryResolveTime(fileOpenTime ?? eventTimestamp), file.id);
    } else if (MEDIA_BILIVE_FILE_EVENT.FileClosed === event) {
        const fileSize = eventData['FileSize'] ?? 0;
        const fileCloseTime = eventData['FileCloseTime'];
        if (!file) {
            printAndPushNotificationWarnMessage(`[Bilive File Closed] Cannot found opening file from repository for file closed event. `
                + `Create a new file record. File path: ${filePath}. `
                + `Event data: ${JSON.stringify(eventData)}`);
            const streamId = await getBiliveLatestStreamIdBySessionId(sessionId, recordId, roomId, hostName, title, areaNameParent, areaNameChild);
            const { rows } = await biliveFileRep.insertFile(sessionId, streamId, title, filePath, tryResolveTime(fileOpenTime), tryResolveTime(fileCloseTime ?? eventTimestamp), fileSize);
            if (rows > 0) return;
        }
        file && await biliveFileRep.updateFileClosed(tryResolveTime(fileCloseTime ?? eventTimestamp), fileSize, file.id);
    }
}

/**
 * 根据直播流 ID 获取其下所有切片文件列表（文件大小自动格式化为可读字符串）
 * @param {number} streamId - 直播流 ID
 * @returns {Promise<Array<any>>}
 */
export async function getFilesByStreamId(streamId) {
    const data = await biliveFileRep.selectFilesByStreamId(streamId).then(({ data }) => data);
    return data.map(file => {
        const fileSize = formatFileSize(file.fileSize);
        return {
            ...file,
            fileSize
        };
    });
}

const CAN_UPLOAD_FILE_STATUS = [
    MEDIA_BILIVE_RECORD_FILE_STATUS.CLOSED
];
const CAN_UPLOAD_FILE_SYNC_STATUS = [
    MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.NOT_SYNCHRONIZED,
    MEDIA_BILIVE_RECORD_FILE_SYNC_STATUS.SYNCHRONIZED
];

/**
 * 将录制切片文件上传同步至媒体对象存储 (MinIO)
 * @param {number} id - 切片文件主键 ID
 * @param {boolean} [ignoreAutoSync=false] - 是否忽略自动同步并发检查
 * @param {boolean} [executeAsync=true] - 是否异步执行任务链
 * @returns {Promise<void>}
 */
export async function uploadFileToMediaByFileId(id, ignoreAutoSync = false, executeAsync = true) {
    const file = await biliveFileRep.selectFileById(id);
    file || __throwMessage('File not found.');
    const { streamId, filePath, fileStatus, syncStatus, startTime } = file;
    CAN_UPLOAD_FILE_STATUS.includes(fileStatus) || __throwMessage('Illegal file status, cannot upload.');
    CAN_UPLOAD_FILE_SYNC_STATUS.includes(syncStatus) || __throwMessage('Illegal sync status.');
    const video = await biliveStreamRep.selectExistsVideoByStreamId(streamId);
    video || __throwMessage('Stream video not initialized.');
    const { videoId, status: videoStatus, streaming } = video;
    !ignoreAutoSync && streaming === MEDIA_BILIVE_STREAM_STATUS.AUTO_ASYNC && __throwMessage('Stream auto sync, cannot upload file manually.');
    validateVideoStatusCanNotCreateMinio(videoStatus);
    if ((await biliveFileRep.updateFileUploading(id))?.rows === 0) {
        __throwMessage('Prepare to upload failed.');
    }
    try {
        // upload cover if not exists
        const coverExists = await videoMinioRep.selectMinioExistsByVideoIdAndType(videoId, MEDIA_VIDEO_MINIO_TYPE.COVER);
        const uploadCallback = await initUploadStorageCallback(coverExists ? 2 : 3, id);
        if (!coverExists) {
            const cover = generateVideoStorageFilePath(filePath, '.cover.jpg');
            await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.COVER, cover, null, uploadCallback, executeAsync);
        }
        const title = generateStorageTitle(startTime);
        // upload barrage
        const barrage = generateVideoStorageFilePath(filePath, '.xml');
        await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.BARRAGE, barrage, title, uploadCallback, executeAsync);
        // upload source
        const source = generateVideoStorageFilePath(filePath, '.flv');
        const convertBiliveStreamFileFlvToMp4 = await getConvertBiliveStreamFileFlvToMp4Option();
        if (convertBiliveStreamFileFlvToMp4) {
            if (executeAsync) {
                const uploadTimeout = await getMediaUploadTimeoutOption();
                await executeAsyncTaskChain([
                    async () => {
                        const convertedSource = await tryConvertFlvToMp4(source);
                        await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.SOURCE, convertedSource, title, uploadCallback, executeAsync);
                    }
                ], uploadTimeout);
            } else {
                const convertedSource = await tryConvertFlvToMp4(source);
                await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.SOURCE, convertedSource, title, uploadCallback, executeAsync);
            }
        } else {
            await uploadVideoStorage(videoId, MEDIA_VIDEO_MINIO_TYPE.SOURCE, source, title, uploadCallback, executeAsync);
        }
    } finally {
        // setup file uploaded
        await biliveFileRep.updateFileUploaded(id);
    }
}

async function initUploadStorageCallback(triggerSuccessCount, fileId) {
    const flag = await getMediaAutoDeleteStreamFile();
    if (!flag) return null;
    let successCount = 0;
    let triggered = false;
    return async (uploadComplete) => {
        if (!triggered && uploadComplete) {
            successCount++;
            if (successCount >= triggerSuccessCount) {
                triggered = true;
                __log.info('All files upload complete, ready to remove files.');
                await removeFileByFileId(fileId);
            }
        }
    };
}

function generateStorageTitle(startTime) {
    if (!startTime) return null;
    try {
        const d = new Date(startTime);
        return dateFormat(d, '[yyyy/MM/dd HH:mm:ss]');
    } catch (error) {
        return null;
    }
}

async function tryConvertFlvToMp4(fileUri) {
    const FILE_PROTOCOL = 'file://';
    let fullFilePath = fileUri;
    if (fileUri.startsWith(FILE_PROTOCOL)) {
        fullFilePath = fileUri.substring(FILE_PROTOCOL.length);
    }
    const ext = path.extname(fullFilePath);
    if (ext === '.flv') {
        const mp4FilePath = fullFilePath.substring(0, fullFilePath.length - 4) + '.mp4';
        __log.info(`[BiliveFile] Ready to convert flv file to mp4: ${fullFilePath} -> ${mp4FilePath}`);
        const convertResult = await convertFlvToMp4(fullFilePath, mp4FilePath);
        if (convertResult === 0) {
            __log.info(`[BiliveFile] Convert flv file to mp4 success: ${mp4FilePath}.`);
            return FILE_PROTOCOL + mp4FilePath;
        } else {
            __log.error(`[BiliveFile] Convert flv file to mp4 failed.`);
            __throwMessage(`Convert flv file to mp4 failed.`);
        }
    }
    return fileUri;
}

async function uploadVideoStorage(videoId, type, uri, title, uploadCallback, executeAsync = true) {
    const code = await createMinioManually({ videoId, type, uri, title }, uploadCallback, executeAsync);
    const desc = MEDIA_TYPE_DESCRIPTION[type];
    const message = `Upload ${desc} file to minio ${code ? 'success' : 'timeout'}.`;
    const messageType = code ? 'info' : 'warning';
    __log.info(message);
    Tracer.tryStreamMessage(message, `message:${messageType}`);
}

/**
 * 移除录制切片对应的本地所有文件（封面、源文件、弹幕、转码MP4）并更新状态为 REMOVED
 * @param {number} id - 切片文件 ID
 * @param {boolean} [safely=false] - 是否开启安全删除校验
 * @returns {Promise<void>}
 */
export async function removeFileByFileId(id, safely = false) {
    if (safely) {
        const stream = await biliveStreamRep.selectStreamByFileId(id);
        stream?.streaming === MEDIA_BILIVE_STREAM_STATUS.AUTO_ASYNC && __throwMessage('Stream auto sync, cannot remove file manually.');
    }
    const file = await biliveFileRep.selectFileById(id);
    file || __throwMessage('File not found.');
    const { filePath, fileStatus } = file;
    MEDIA_BILIVE_RECORD_FILE_STATUS.REMOVED === fileStatus && __throwMessage('File has been removed.');
    await biliveFileRep.updateFileRemovedPending(id);
    const cover = generateVideoStorageFilePath(filePath, '.cover.jpg', false);
    const barrage = generateVideoStorageFilePath(filePath, '.xml', false);
    const source = generateVideoStorageFilePath(filePath, '.flv', false);
    const mp4Source = generateVideoStorageFilePath(filePath, '.mp4', false);
    const toRemoveFiles = [cover, source, barrage, mp4Source];
    const uploadTimeout = await getMediaUploadTimeoutOption();
    await executeAsyncTaskChain([async () => {
        const result = await removeRemoteFiles(toRemoveFiles);
        if (result === 0) {
            await biliveFileRep.updateFileRemoved(id);
        } else {
            __log.warn(`[BiliveFile] [${id}] Batch remove file failed, restore file status.`, toRemoveFiles);
            await biliveFileRep.restoreFileRemoveFailed(id);
        }
    }], uploadTimeout);
}

/**
 * 物理删除已标记为已移除的切片记录
 * @param {number} id - 文件 ID
 * @param {boolean} [safely=false] - 是否安全检查
 * @returns {Promise<void>}
 */
export async function deleteFile(id, safely = false) {
    if (safely) {
        const stream = await biliveStreamRep.selectStreamByFileId(id);
        stream?.streaming === MEDIA_BILIVE_STREAM_STATUS.AUTO_ASYNC && __throwMessage('Stream auto sync, cannot remove file manually.');
    }
    await biliveFileRep.deleteFileById(id);
}

function tryResolveTime(time) {
    try {
        return new Date(time);
    } catch (ignored) {
        return new Date();
    }
}

function printAndPushNotificationWarnMessage(message) {
    __log.warn(message);
    pushNotification(message);
}