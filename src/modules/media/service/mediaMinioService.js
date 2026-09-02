import path from 'path';
import videoMinioRep from "../repository/videoMinioRep.js";
import { MEDIA_MINIO_STATUS, MEDIA_MINIO_TYPE_MAIN, MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_MINIO_TYPE, MEDIA_VIDEO_STATUS } from "../constants/mediaConst.js";
import videosRep from "../repository/videosRep.js";
import { getMinioClient } from "#core/instance/minioClient.js";
import { addTask, removeTask } from "./mediaTaskService.js";
import aria2TaskRep from "../repository/aria2TaskRep.js";
import categoriesRep from '../repository/categoriesRep.js';
import authorsRep from '../repository/authorsRep.js';
import { generateUUID } from '#utils/cryptoUtil.js';
import { urlContentLengthLargeThanOneMB } from '#utils/httpUtil.js';
import { ASYNC_SEQUENCE_EXECUTE_STATUS, executeAsyncTaskChain } from '#core/infra/asyncSequence.js';
import { pushNotification } from '#api/sockets/notification.js';
import { getMediaSafelyDeleteStorage, getMediaUploadTimeoutOption } from './mediaOptionsService.js';
import { copyRemoteFileToMinio, downloadFileToMinio } from '../../ssh/sshExecutorService.js';

/** 支持的 MinIO 资源类型列表 */
const SUPPORTED_MEDIA_MINIO_TYPE = Object.values(MEDIA_VIDEO_MINIO_TYPE);

/**
 * 查询指定视频关联的全部 MinIO 资源及各自绑定的 Aria2 下载任务
 * @param {number} videoId - 视频 ID
 * @returns {Promise<{ videoStatus: number, videoTotalSize: string, storages: any[] }|null>}
 */
export async function searchMinio(videoId) {
    const videoInfo = await videosRep.selectOne(videoId);
    if (!videoInfo) return null;
    const result = { videoStatus: videoInfo.status, videoTotalSize: videoInfo.totalSize, storages: [] };
    const minioList = await videoMinioRep.selectByVideoId(videoId).then(({ data }) => data);
    if (Array.isArray(minioList)) {
        const minioIdMapping = new Map();
        for (let i = 0; i < minioList.length; i++) {
            const minio = minioList[i];
            minio.tasks = [];
            minioIdMapping.set(minio.id, minio);
        }
        if (minioIdMapping.size > 0) {
            const { rows, data } = await aria2TaskRep.selectByMinioIds(Array.from(minioIdMapping.keys()));
            if (rows > 0) {
                data.forEach(task => minioIdMapping.get(task.minioId)?.tasks?.push?.(task));
            }
            minioIdMapping.clear();
        }
    }
    result.storages = minioList;
    return result;
}

/** 禁止创建 MinIO 资源的视频状态列表 */
const CAN_NOT_CREATE_MINIO_VIDEO_STATUS = [
    MEDIA_VIDEO_STATUS.ANALYZING,
    MEDIA_VIDEO_STATUS.REMOVED
];

/**
 * 校验视频状态是否允许创建 MinIO 存储资源
 * @param {number} status - 视频状态
 */
export function validateVideoStatusCanNotCreateMinio(status) {
    CAN_NOT_CREATE_MINIO_VIDEO_STATUS.includes(status) && __throwMessage('Invalid video status, cannot create minio.');
}

/**
 * 手动创建单个 MinIO 对象存储任务并触发上传/下载任务流
 * @param {import('#types/mediaTypes.d.ts').MediaMinioCreateOptions} minioObj - MinIO 对象参数
 * @param {(complete: boolean) => any} [callback] - 上传完成后的回调函数
 * @param {boolean} [executeAsync=true] - 是否异步排队执行
 * @returns {Promise<number>} 1 成功，0 超时或失败
 */
export async function createMinioManually(minioObj, callback, executeAsync = true) {
    const { videoId, type, uri, sort, title } = minioObj;
    // validate type
    SUPPORTED_MEDIA_MINIO_TYPE.includes(type) || __throwMessage('Invalid type.');
    // validate video exists
    const videoInfo = await videosRep.selectOne(videoId);
    videoInfo || __throwMessage('Video not exists.');
    // validate minio exists
    const minioExists = await validateMinioExists(videoId, type);
    minioExists && __throwMessage('Minio exists.');
    // validate video status
    const { categoryId, authorId, status } = videoInfo;
    validateVideoStatusCanNotCreateMinio(status);
    // validate category exists
    const categoryInfo = await categoriesRep.selectOneById(categoryId);
    categoryInfo || __throwMessage('Category not exists.');
    // validate author exists
    const category = categoryInfo.name;
    const authorInfo = await authorsRep.selectOneById(authorId);
    authorInfo || __throwMessage('Author not exists.');
    // resolve uri and create minio
    const author = authorInfo.name;
    const uuid = generateUUID();
    const task = await resolveStorageUriWithCreate(uri, videoId, category, author, uuid, type, sort, title);
    if (task === null) {
        // update video minio status
        await updateVideoStatusByVideoMinioStatus(videoId);
        return 1;
    } else {
        if (executeAsync) {
            const uploadTimeout = await getMediaUploadTimeoutOption();
            const { status } = await executeAsyncTaskChain([
                async () => {
                    const complete = await task();
                    if (typeof callback === 'function') {
                        await callback(complete);
                    }
                },
                async () => updateVideoStatusByVideoMinioStatus(videoId)
            ], uploadTimeout);
            return status === ASYNC_SEQUENCE_EXECUTE_STATUS.TIMEOUT ? 0 : 1;
        }
        const complete = await task();
        if (typeof callback === 'function') {
            await callback(complete);
        }
        await updateVideoStatusByVideoMinioStatus(videoId);
        return 1;
    }
}

/** 仅允许单条存在的资源类型 (如 COVER 封面) */
const MEDIA_MINIO_UNIQUE_TYPE = [MEDIA_VIDEO_MINIO_TYPE.COVER];

/**
 * 校验指定视频与资源类型是否已存在
 * @param {number} videoId - 视频 ID
 * @param {number} type - 资源类型
 * @returns {Promise<number|boolean>}
 */
async function validateMinioExists(videoId, type) {
    if (MEDIA_MINIO_UNIQUE_TYPE.includes(parseInt(String(type)))) {
        return await videoMinioRep.selectMinioExistsByVideoIdAndType(videoId, type);
    }
    return false;
}

const FILE_PROTOCOL = ['file:'];
const HTTP_PROTOCOL = ['http:', 'https:'];

/**
 * 解析 URI 协议并分发执行上传或 Aria2 离线下载任务
 * @param {string} uri - 资源 URI
 * @param {number} videoId - 视频 ID
 * @param {string} minioLink - 目标 MinIO 存储路径
 * @param {number} minioId - video_minio 主键 ID
 * @param {number} type - 资源类型
 * @returns {Promise<(() => Promise<boolean>)|null>}
 */
async function resolveStorageUri(uri, videoId, minioLink, minioId, type) {
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type];
    const resolvedUri = generateUri(uri);
    resolvedUri === null && __throwMessage(`Uri invalid.`);
    const protocol = resolvedUri.protocol;
    if (FILE_PROTOCOL.includes(protocol)) {
        // file protocol
        __log.info(`[${videoId}] Video's ${typeDesc} uri is a file, prepare move to minio: ${uri} -> ${minioLink}.`);
        const decodedFilePath = decodeURIComponent(resolvedUri.pathname);
        return async () => uploadFileToMinio(decodedFilePath, minioLink, minioId);
    } else if (HTTP_PROTOCOL.includes(protocol)) {
        // http protocol
        const overSizeOneMB = await urlContentLengthLargeThanOneMB(uri);
        // Get the url file size. 
        // If it cannot be obtained or is larger than 1MB, upload it to aria2 for download. 
        // Otherwise, upload it directly to minio.
        if (overSizeOneMB) {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a large size remote link, add aria2 task for download: ${uri} -> ${minioLink}.`);
            await addTask(uri, minioId, type);
            await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.DOWNLOADING);
        } else {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a tiny remote link, upload uri to minio: ${uri} -> ${minioLink}.`);
            return async () => {
                const complete = await uploadUrlToMinio(uri, minioLink, minioId);
                if (!complete) {
                    __log.info(`[${videoId}] Video's ${typeDesc} upload to minio failed, add aria2 task for download: ${uri} -> ${minioLink}.`);
                    await addTask(uri, minioId, type);
                    await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.DOWNLOADING);
                }
                return complete;
            };
        }
    } else {
        const message = `[${videoId}] Cannot resolve video ${typeDesc} uri: ${uri}`;
        __log.warn(message);
        pushNotification(message);
        await videoMinioRep.updateStatusById(minioId, MEDIA_MINIO_STATUS.FAILED);
    }
    return null;
}

/**
 * 生成 MinIO 路径、落库 video_minio 记录并返回执行任务函数
 * @param {string} [uri=''] - 原始资源 URI
 * @param {number} videoId - 视频 ID
 * @param {string} category - 分类名称
 * @param {string} author - 创作者名称
 * @param {string} uuid - 唯一标识 UUID
 * @param {number} type - 资源类型
 * @param {number} [sort] - 排序权重
 * @param {string} [title] - 资源标题
 * @returns {Promise<(() => Promise<boolean>)|null>}
 */
export async function resolveStorageUriWithCreate(uri = '', videoId, category, author, uuid, type, sort, title) {
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type];
    const resolvedUri = generateUri(uri);
    if (resolvedUri === null) {
        __log.warn(`[${videoId}] Skipped resolve video ${typeDesc}, cause uri invalid. ${uri}`);
        return null;
    }
    // generate minioLink
    const ext = path.extname(resolvedUri.pathname);
    const minioLink = generateMinioLink(category, author, uuid, type, ext);
    sort ??= await videoMinioRep.selectMaxSortOfType(videoId, type).then(s => s + 1);
    // save minio
    const { rows, lastId } = await videoMinioRep.insertOne({ videoId, type, uri, link: minioLink, status: MEDIA_MINIO_STATUS.PREPARED, title, sort });
    if (rows === 0) {
        __log.error(`Resolve video minio failed, cause unique(${videoId}, ${type}) exists.`);
        __throwMessage(`Resolve video ${typeDesc} minio failed.`);
    }
    // update video minio id
    if (MEDIA_MINIO_TYPE_MAIN.includes(parseInt(String(type)))) {
        await videosRep.updateMinioIdById(videoId, lastId, type);
    }
    return resolveStorageUri(uri, videoId, minioLink, lastId, type);
}

/** 允许手动更新的 MinIO 状态 */
const CAN_UPDATE_MEDIA_MINIO_STATUS = [MEDIA_MINIO_STATUS.COMPLETE, MEDIA_MINIO_STATUS.FAILED];

/**
 * 手动更新 MinIO 资源状态（成功时自动回填对象大小并级联更新视频状态）
 * @param {number} id - video_minio 主键 ID
 * @param {number|string} status - 目标状态
 * @returns {Promise<void>}
 */
export async function updateMinioStatus(id, status) {
    const minioStatus = parseInt(String(status));
    // validate minio status
    CAN_UPDATE_MEDIA_MINIO_STATUS.includes(minioStatus) || notifyUpdateMediaMinioStatusFailed('Invalid media minio status.', id);
    // validate minio exists
    const videoMinio = await videoMinioRep.selectOneById(id);
    videoMinio || notifyUpdateMediaMinioStatusFailed('Media minio not exists.', id);
    const videoId = videoMinio.videoId;
    // save minio
    const { rows } = await videoMinioRep.updateStatusById(id, minioStatus);
    rows > 0 || notifyUpdateMediaMinioStatusFailed('Save media minio status failed.', id);
    minioStatus === MEDIA_MINIO_STATUS.COMPLETE && await tryBackfillObjectSize(id);
    // update video status
    await updateVideoStatusByVideoMinioStatus(videoId);
}

function notifyUpdateMediaMinioStatusFailed(message, id) {
    pushNotification(`Update media minio[${id}] status failed: ${message}`);
    __throwMessage(message);
}

/**
 * 根据各关联 MinIO 资源的完成情况推导并刷新视频主表状态与总容量大小
 * @param {number} videoId - 视频 ID
 * @returns {Promise<number>} 更新后的视频状态
 */
export async function updateVideoStatusByVideoMinioStatus(videoId) {
    const videoStatus = await videosRep.updateVideoStatus(videoId);
    if (videoStatus === MEDIA_VIDEO_STATUS.PREPARED) {
        __log.warn(`[${videoId}] Video minio not found, setup video status to prepared.`);
    } else if (videoStatus === MEDIA_VIDEO_STATUS.UPLOADING) {
        __log.info(`[${videoId}] Video minio any resolving, setup video status to uploading.`);
    } else if (videoStatus === MEDIA_VIDEO_STATUS.COMPLETE) {
        __log.info(`[${videoId}] Video minio all resolved, setup video status to complete.`);
    }
    await tryUpdateVideoTotalSize(videoId);
    return videoStatus;
}

async function tryUpdateVideoTotalSize(videoId) {
    try {
        const totalSize = await videoMinioRep.selectTotalSizeByVideoId(videoId);
        totalSize && await videosRep.updateTotalSize(videoId, totalSize);
    } catch (err) {
        __log.error(`[${videoId}] Update video total size failed. Cause: ${err.message ?? 'Unknown error'}`);
    }
}

/**
 * 执行本地文件上传至 MinIO
 * @param {string} filePath - 本地文件路径
 * @param {string} minioLink - MinIO 目标链接
 * @param {number} lastId - video_minio 主键 ID
 * @returns {Promise<boolean>}
 */
async function uploadFileToMinio(filePath, minioLink, lastId) {
    await videoMinioRep.updateStatusById(lastId, MEDIA_MINIO_STATUS.UPLOADING);
    const result = await executeSshScript(filePath, minioLink, true);
    const complete = result === 0;
    const minioStatus = complete ? MEDIA_MINIO_STATUS.COMPLETE : MEDIA_MINIO_STATUS.FAILED;
    await videoMinioRep.updateStatusById(lastId, minioStatus);
    complete && await tryBackfillObjectSize(lastId);
    return complete;
}

/**
 * 执行网络 URL 抓取并上传至 MinIO
 * @param {string} url - 远程 URL
 * @param {string} minioLink - MinIO 目标链接
 * @param {number} lastId - video_minio 主键 ID
 * @returns {Promise<boolean>}
 */
async function uploadUrlToMinio(url, minioLink, lastId) {
    const result = await executeSshScript(url, minioLink, false);
    const complete = result === 0;
    const minioStatus = complete ? MEDIA_MINIO_STATUS.COMPLETE : MEDIA_MINIO_STATUS.FAILED;
    await videoMinioRep.updateStatusById(lastId, minioStatus);
    complete && await tryBackfillObjectSize(lastId);
    return complete;
}

async function executeSshScript(resourcePath, minioLink, isFileResource = false) {
    const client = getMinioClient();
    if (!client?.ready()) {
        logAndPushNotification(`Upload minio object failed. Cause client not ready.`);
        return -1;
    }
    const suitableMinioLink = client.generateSuitableMinioLink(minioLink);
    if (isFileResource) {
        return await copyRemoteFileToMinio(resourcePath, suitableMinioLink);
    } else {
        return await downloadFileToMinio(resourcePath, suitableMinioLink);
    }
}

async function tryBackfillObjectSize(minioId) {
    const minioInfo = await videoMinioRep.selectOneById(minioId);
    if (!minioInfo) return;
    const { link, status } = minioInfo;
    if (MEDIA_MINIO_STATUS.COMPLETE !== status) return;
    const client = getMinioClient();
    if (!client?.ready()) return;
    try {
        const stat = await client.getObjectStat(link);
        let size = stat.size;
        if (__isNotBlank(size)) {
            size = String(size).split('.')[0];
        }
        await videoMinioRep.updateObjectSizeById(size, minioId);
    } catch (err) {
        __log.error(`Back fill minio object size failed. Cause: ${err?.message ?? 'Unknown error'}`);
    }
}

const CAN_UPDATE_MINIO_ORIGIN_URI_STATUS = [MEDIA_MINIO_STATUS.FAILED];

/**
 * 更新失败 MinIO 任务的原始 URI 链接
 * @param {number} minioId - MinIO ID
 * @param {string} originUri - 新的 URI
 * @returns {Promise<void>}
 */
export async function updateMinioOriginUri(minioId, originUri) {
    const minioInfo = await videoMinioRep.selectOneById(minioId);
    minioInfo || __throwMessage('Video minio not found.');
    const { status } = minioInfo;
    CAN_UPDATE_MINIO_ORIGIN_URI_STATUS.includes(status) || __throwMessage('Cannot update minio origin uri.');
    await videoMinioRep.updateOriginUriById(originUri, minioId);
}

/**
 * 重新尝试执行失败的 MinIO 资源上传
 * @param {number} minioId - MinIO ID
 * @returns {Promise<number>} 1 成功，0 超时
 */
export async function retryMinio(minioId) {
    const result = await videoMinioRep.selectOneById(minioId);
    result || __throwMessage('Minio not found.');
    const { id, videoId, originUri, type, status, link } = result;
    status !== MEDIA_MINIO_STATUS.FAILED && __throwMessage('Minio can not retry.');
    const aria2Tasks = await aria2TaskRep.selectByMinioId(minioId).then(({ data }) => data);
    __isNotEmptyArray(aria2Tasks) && __throwMessage('Minio can not retry, cause aria2 task exists in this minio.');
    // resolve origin uri
    const task = await resolveStorageUri(originUri, videoId, link, id, type);
    if (task === null) {
        // update video status
        await updateVideoStatusByVideoMinioStatus(videoId);
        return 1;
    } else {
        // execute async task chain
        const uploadTimeout = await getMediaUploadTimeoutOption();
        const { status } = await executeAsyncTaskChain([
            task,
            async () => updateVideoStatusByVideoMinioStatus(videoId)
        ], uploadTimeout);
        return status === ASYNC_SEQUENCE_EXECUTE_STATUS.TIMEOUT ? 0 : 1;
    }
}

/**
 * 更新 MinIO 资源的标题与排序号
 * @param {Object} body - 参数
 * @param {number} body.id - MinIO ID
 * @param {string} body.title - 标题
 * @param {number} [body.sort=0] - 排序值
 * @returns {Promise<void>}
 */
export async function updateMinioTitleAndSort(body) {
    const { id, title, sort = 0 } = body;
    await videoMinioRep.updateTitleAndSortById(title, sort, id);
}

const CANT_NOT_DELETE_MINIO_STATUS = [
    MEDIA_MINIO_STATUS.UPLOADING
];

/**
 * 删除指定的 MinIO 资源（清理远程对象、关联 Aria2 任务与数据库记录）
 * @param {number} minioId - MinIO ID
 * @param {boolean} [safely=false] - 是否开启安全检查
 * @returns {Promise<void>}
 */
export async function deleteVideoMinio(minioId, safely = false) {
    const minioInfo = await videoMinioRep.selectOneById(minioId);
    if (!minioInfo) return;
    const { id, link, status, videoId } = minioInfo;
    safely && CANT_NOT_DELETE_MINIO_STATUS.includes(status) && __throwMessage('Minio can not delete.');
    const { rows } = await videoMinioRep.updateStatusById(id, MEDIA_MINIO_STATUS.REMOVED);
    const aria2Tasks = await aria2TaskRep.selectByMinioId(minioId).then(({ data }) => data);
    if (__isNotEmptyArray(aria2Tasks)) {
        const safelyDeleteStorage = await getMediaSafelyDeleteStorage();
        safelyDeleteStorage && __throwMessage('Minio can not delete, cause aria2 task exists in this minio.');
        for (const { id } of aria2Tasks) {
            await removeTask(id);
        }
    }
    if (rows > 0) {
        __log.info(`[${id}] Ready to remove minio.`);
        if (__isNotBlank(link)) {
            const minioDeleted = await deleteMinioAndObject(link, id);
            minioDeleted || __throwMessage(`Minio object delete failed.`);
        }
    }
    await videoMinioRep.deleteByMinioId(id);
    await tryUpdateVideoTotalSize(videoId);
}

async function deleteMinioAndObject(minioLink, minioId) {
    __log.info(`[${minioId}] Ready to delete minio object: ${minioLink}`);
    const client = getMinioClient();
    if (!client?.ready()) {
        logAndPushNotification(`Delete minio object failed. Cause client not ready.`);
        return false;
    }
    return client.deleteObject(minioLink, err => logAndPushNotification(err.message ?? 'Unknown minio error.', minioId));
}

function logAndPushNotification(message, minioId) {
    const msg = (__isNotBlank(minioId) ? `[${minioId}] ` : '') + `${message}`;
    __log.error(msg);
    pushNotification(msg);
}

function generateUri(uri) {
    try {
        return new URL(uri);
    } catch (ignored) {
        return null;
    }
}

function generateMinioLink(category, author, uniqueId, type, ext) {
    const minioBucket = getMinioBucketByCategory(category);
    minioBucket || __throwMessage('Unable to find a suitable category of bucket.');
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type];
    return `/${minioBucket}/${category}/${author}/${typeDesc}:${uniqueId}${ext}`;
}

function getMinioBucketByCategory(category) {
    const client = getMinioClient();
    client.ready() || __throwMessage('Minio not ready.');
    return client.generateSuitableMinioBucket(category);
}

export function getMinioClientMatchers() {
    const client = getMinioClient();
    client.ready() || __throwMessage('Minio not ready.');
    return client.getMinioMatchers();
}

export function getMinioClientMatchersSafely() {
    const client = getMinioClient();
    if (client.ready()) {
        return client.getMinioMatchers();
    }
    return null;
}

export function generateMinioSourceSafely(minioLink) {
    const client = getMinioClient();
    if (client?.ready?.()) {
        const clientMatchers = client.getMinioMatchers() || [];
        for (const label in clientMatchers) {
            const { matcher, hostname } = clientMatchers[label];
            try {
                if (new RegExp(matcher).test(minioLink)) {
                    return `https://${hostname}${minioLink}`;
                }
            } catch (ex) {
            }
        }
    }
    return `https://minio-api-media.vinoxm.art${minioLink}`;
}