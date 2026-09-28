import videoMinioRep from "#modules/media/repository/videoMinioRep.js";
import { MEDIA_MINIO_STATUS, MEDIA_TYPE_DESCRIPTION } from "#modules/media/constants/mediaConst.js";
import { getMinioClient } from "#core/instance/minioClient.js";
import { urlContentLengthLargeThanOneMB } from '#utils/httpUtil.js';
import { pushNotification } from '#api/sockets/notification.js';
import { copyRemoteFileToMinio, downloadFileToMinio } from '#modules/ssh/sshExecutorService.js';

/**
 * MinIO 入库纯 IO 服务（无状态副作用）
 *
 * 这里只做"与外部世界打交道"的动作并返回结果：SSH 上传/下载、HEAD 探测、路径生成、对象大小回填。
 * 不写 video_minio 状态、不涉及重试调度——状态机与调度统一在 mediaMinioStateService 内部。
 * 目的：把责任环（状态迁移 ↔ 调度 ↔ 执行 ↔ 入库）收敛在一个模块内，同时让纯 IO 保持独立可测。
 */

/**
 * 探测远程 URL 内容是否大于 1MB（无法获取大小时按大于处理）
 * @param {string} url - 远程 URL
 * @returns {Promise<boolean>}
 */
export async function isRemoteUrlLargerThanOneMB(url) {
    return urlContentLengthLargeThanOneMB(url);
}

/**
 * 通过 SSH 将远程文件复制并上传至 MinIO
 * @param {string} filePath - 远程源文件绝对路径
 * @param {string} minioLink - MinIO 目标链接
 * @param {{ timeoutMs?: number }} [opts={}] - 执行选项（timeoutMs 为单次执行硬超时）
 * @returns {Promise<boolean>} 是否成功
 */
export async function copyLocalFileToMinio(filePath, minioLink, opts = {}) {
    const code = await executeSshScript(filePath, minioLink, true, opts);
    return code === 0;
}

/**
 * 通过 SSH 抓取网络 URL 并流式转存至 MinIO
 * @param {string} url - 远程 URL
 * @param {string} minioLink - MinIO 目标链接
 * @param {{ timeoutMs?: number, useProxy?: boolean }} [opts={}] - 执行选项（timeoutMs 为单次执行硬超时）
 * @returns {Promise<boolean>} 是否成功
 */
export async function downloadUrlToMinio(url, minioLink, opts = {}) {
    const code = await executeSshScript(url, minioLink, false, opts);
    return code === 0;
}

/**
 * 执行底层 SSH 上传/下载脚本
 * @param {string} resourcePath - 本地文件路径或远程 URL
 * @param {string} minioLink - MinIO 目标链接
 * @param {boolean} [isFileResource=false] - 是否为本地文件资源
 * @param {{ timeoutMs?: number, useProxy?: boolean }} [opts={}] - 执行选项
 * @returns {Promise<number>} 脚本退出码 (-1 表示 MinIO 客户端未就绪)
 */
async function executeSshScript(resourcePath, minioLink, isFileResource = false, opts = {}) {
    const client = getMinioClient();
    if (!client?.ready()) {
        logAndPushNotification(`Upload minio object failed. Cause client not ready.`);
        return -1;
    }
    const suitableMinioLink = client.generateSuitableMinioLink(minioLink);
    const { timeoutMs, useProxy } = opts;
    if (isFileResource) {
        return await copyRemoteFileToMinio(resourcePath, suitableMinioLink, { timeoutMs });
    }
    return await downloadFileToMinio(resourcePath, suitableMinioLink, { timeoutMs, useProxy });
}

/**
 * 解析 URI 为 URL 对象，非法时返回 null
 * @param {string} uri - 资源 URI
 * @returns {URL|null}
 */
export function generateUri(uri) {
    try {
        return new URL(uri);
    } catch (ignored) {
        return null;
    }
}

/**
 * 生成 MinIO 对象存储路径
 * @param {string} category - 分类名称
 * @param {string} author - 创作者名称
 * @param {string} uniqueId - 唯一标识 UUID
 * @param {number} type - 资源类型
 * @param {string} ext - 文件扩展名
 * @returns {string}
 */
export function generateMinioLink(category, author, uniqueId, type, ext) {
    const minioBucket = getMinioBucketByCategory(category);
    minioBucket || __throwMessage('Unable to find a suitable category of bucket.');
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type];
    return `/${minioBucket}/${category}/${author}/${typeDesc}:${uniqueId}${ext}`;
}

/**
 * 根据分类解析适用的 MinIO bucket
 * @param {string} category - 分类名称
 * @returns {string}
 */
export function getMinioBucketByCategory(category) {
    const client = getMinioClient();
    client.ready() || __throwMessage('Minio not ready.');
    return client.generateSuitableMinioBucket(category);
}

/**
 * 回填 MinIO 对象占用大小（仅当资源已 COMPLETE）
 * @param {number} minioId - video_minio 主键 ID
 * @returns {Promise<void>}
 */
export async function tryBackfillObjectSize(minioId) {
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

/**
 * 记录错误日志并推送通知
 * @param {string} message - 错误信息
 * @param {number} [minioId] - MinIO ID
 * @returns {void}
 */
export function logAndPushNotification(message, minioId) {
    const msg = (__isNotBlank(minioId) ? `[${minioId}] ` : '') + `${message}`;
    __log.error(msg);
    pushNotification(msg);
}
