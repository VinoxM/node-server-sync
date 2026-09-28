import videoMinioRep from "#modules/media/repository/videoMinioRep.js";
import { MEDIA_ARIA2_TASK_STATUS, MEDIA_MINIO_STATUS, MEDIA_TYPE_DESCRIPTION, MEDIA_VIDEO_STATUS } from "#modules/media/constants/mediaConst.js";
import videosRep from "#modules/media/repository/videosRep.js";
import aria2TaskRep from "#modules/media/repository/aria2TaskRep.js";
import { ASYNC_SEQUENCE_EXECUTE_STATUS, executeAsyncTaskChain } from "#core/infra/asyncSequence.js";
import { SHUTDOWN_PRIORITY } from "#core/infra/shutdownHook.js";
import { pushNotification } from "#api/sockets/notification.js";
import { getMediaUploadTimeoutOption } from "#modules/media/service/mediaOptionsService.js";
import { addTask, removeTask, getGidStatusMap } from "./mediaAria2TaskService.js";
import { generateUri, isRemoteUrlLargerThanOneMB, copyLocalFileToMinio, downloadUrlToMinio, tryBackfillObjectSize } from "./mediaMinioIoService.js";

/**
 * MinIO 入库状态机 + 失败重试（核心模块）
 *
 * 为什么把「状态迁移 / 重试计数 / 调度 / 执行 / 入库编排」放在同一个模块：
 * 这四者构成一个责任环 `状态迁移 → 调度 → 执行 → 入库 → 状态迁移`，import 图只能表达 DAG，
 * 拆到多个模块就必须在环上做一次运行期装配（setter/事件）。放在同一模块内，环退化为普通函数互调，
 * 因此既无循环 import，也无需任何依赖注入/注册。
 *
 * 纯 IO（SSH 上传下载、HEAD 探测、路径生成、对象大小回填）下沉到 mediaMinioIoService，
 * aria2 任务原子操作下沉到 mediaAria2TaskService，二者均由本模块单向依赖。
 */

/* ============================ 状态迁移与重试调度 ============================ */

/**
 * MinIO 状态变更来源，用于判定 FAILED 时是否需要自动重试
 */
export const MINIO_STATUS_SOURCE = {
    /** 入库流程内的直传/文件上传失败 */
    INGEST: 'ingest',
    /** aria2 下载失败回调 */
    ARIA2: 'aria2',
    /** 人工手动修改状态 */
    MANUAL: 'manual',
    /** 清理动作（如移除 aria2 任务）导致的置位 */
    CLEANUP: 'cleanup',
    /** 启动恢复扫描发现的中断残留（进程被杀导致的孤儿状态） */
    RECOVERY: 'recovery'
};

/** 允许触发自动重试的来源（人工与清理语义不自动重试） */
const AUTO_RETRY_SOURCES = [MINIO_STATUS_SOURCE.INGEST, MINIO_STATUS_SOURCE.ARIA2, MINIO_STATUS_SOURCE.RECOVERY];

/** 允许自动重试的原始 URI 协议（只针对 HTTP(S) 远程资源） */
const AUTO_RETRY_PROTOCOLS = ['http:', 'https:'];

/** 自动重试策略 */
const MINIO_RETRY_POLICY = {
    /** 最大自动重试次数（含跨 aria2 失败的累计） */
    maxAttempts: 3,
    /** 重试总窗口 (毫秒)：自首次排期起超过该时长即放弃自动重试（与次数上限双条件） */
    maxRetryWindowMs: 60 * 60 * 1000,
    /** 首次重试延迟 (毫秒) */
    baseDelayMs: 10 * 1000,
    /** 指数退避倍数 */
    backoffFactor: 2,
    /** 单次重试最大延迟 (毫秒) */
    maxDelayMs: 5 * 60 * 1000,
    /**
     * 远端 URL 直传下载的单次硬超时 (毫秒)：超时后向远端发 KILL 并判定失败。
     * 该分支只处理 HEAD 判定为 ≤1MB 的小文件（拿不到大小的一律转 aria2），因此阈值很宽松。
     * 注意：本地文件拷贝（file: 协议）刻意不设超时，原因见 uploadFileToMinio。
     */
    remoteDownloadTimeoutMs: 5 * 60 * 1000
};

/* ============================ 重试状态存储（可替换持久化实现） ============================ */

/**
 * MinIO 重试状态记录
 * @typedef {Object} MinioRetryRecord
 * @property {number} attempt - 已重试次数
 * @property {number|null} dueAt - 下次重试的绝对时间戳 (ms)，null 表示当前无待执行排期
 * @property {number|null} deadline - 放弃自动重试的绝对截止时间戳 (ms)
 */

/**
 * MinIO 重试状态存储接口（默认内存实现；可由 RedisMinioRetryStore 替换）
 * 所有方法均允许返回 Promise。替换为持久化实现后，进程重启可通过 {@link listPendingMinioRetries} 恢复排期。
 * @typedef {Object} MinioRetryStore
 * @property {(minioId: number) => MinioRetryRecord|null|Promise<MinioRetryRecord|null>} load - 读取状态
 * @property {(minioId: number, record: MinioRetryRecord) => void|Promise<void>} save - 覆盖写入状态
 * @property {(minioId: number) => void|Promise<void>} remove - 删除状态（重试成功、被移除或人工重试时）
 * @property {() => Array<{ minioId: number } & MinioRetryRecord>|Promise<Array<{ minioId: number } & MinioRetryRecord>>} listPending - 列出待恢复项（按 dueAt 升序）
 */

/**
 * 默认重试状态实现：进程内存 Map（重启丢失，作为无 Redis 时的兜底）
 * @implements {MinioRetryStore}
 */
export class InMemoryMinioRetryStore {
    /** @type {Map<number, MinioRetryRecord>} 资源 ID -> 重试状态 */
    #records = new Map();

    load(minioId) {
        return this.#records.get(minioId) ?? null;
    }

    save(minioId, record) {
        this.#records.set(minioId, record);
    }

    remove(minioId) {
        this.#records.delete(minioId);
    }

    listPending() {
        return Array.from(this.#records, ([minioId, record]) => ({ minioId, ...record }))
            .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    }
}

/** @type {MinioRetryStore} 当前生效的重试状态存储 */
let retryStore = new InMemoryMinioRetryStore();

/**
 * 注入重试状态存储实现（启动阶段由 mediaMinioRetryStore.initializeMinioRetry → initializeMinioRetryStore 调用）
 * @param {MinioRetryStore} store - 重试状态存储实现
 * @returns {void}
 */
export function setMinioRetryStore(store) {
    const required = ['load', 'save', 'remove', 'listPending'];
    const valid = store && required.every(method => typeof store[method] === 'function');
    valid || __throwMessage(`Minio retry store must implement ${required.join('/')}.`);
    retryStore = store;
}

/**
 * 读取指定资源的重试状态（无记录时返回空状态）
 * @param {number} minioId - MinIO 资源 ID
 * @returns {Promise<MinioRetryRecord>}
 */
async function loadRetryRecord(minioId) {
    return await retryStore.load(minioId) ?? { attempt: 0, dueAt: null, deadline: null };
}

/**
 * 列出全部待恢复的重试状态（按 dueAt 升序），供启动阶段恢复排期使用
 * @returns {Promise<Array<{ minioId: number } & MinioRetryRecord>>}
 */
export async function listPendingMinioRetries() {
    return await retryStore.listPending();
}

/** @type {Map<number, NodeJS.Timeout>} 已排期的重试定时器（资源 ID -> 定时器） */
const pendingRetryTimers = new Map();

/** @type {Set<Promise<any>>} 正在执行中的自动重试任务（供停机排空统计） */
const inFlightRetries = new Set();

/** @type {boolean} 是否已进入停机流程（进入后不再登记新的重试） */
let shuttingDown = false;

/**
 * 统一的 MinIO 状态迁移入口
 * - 迁移到 FAILED 且来源可重试时，登记自动重试；
 * - 迁移到其它状态时取消已排期的重试；迁移到 COMPLETE/REMOVED 时额外清除重试状态记录。
 * @param {number} id - video_minio 主键 ID
 * @param {number} status - 目标状态 (MEDIA_MINIO_STATUS)
 * @param {{ source?: string }} [options={}] - 迁移来源 (MINIO_STATUS_SOURCE)
 * @returns {Promise<ExecResult>}
 */
export async function transitionMinioStatus(id, status, options = {}) {
    const { rows } = await videoMinioRep.updateStatusById(id, status);
    if (status === MEDIA_MINIO_STATUS.FAILED) {
        await tryScheduleMinioRetry(id, options.source);
    } else {
        cancelMinioRetry(id);
        if (status === MEDIA_MINIO_STATUS.COMPLETE || status === MEDIA_MINIO_STATUS.REMOVED) {
            await retryStore.remove(id);
        }
    }
    return { rows };
}

/**
 * 判断状态变更来源是否需要登记自动重试（含协议过滤）
 * @param {number} minioId - MinIO 资源 ID
 * @param {string} [source] - 状态变更来源
 * @returns {Promise<void>}
 */
async function tryScheduleMinioRetry(minioId, source) {
    if (!AUTO_RETRY_SOURCES.includes(source)) {
        __log.debug(`[${minioId}] Minio FAILED source(${source ?? 'unknown'}) is not auto retryable.`);
        return;
    }
    const minioInfo = await videoMinioRep.selectOneById(minioId);
    if (!minioInfo) return;
    if (!isAutoRetryProtocol(minioInfo.originUri)) {
        __log.info(`[${minioId}] Minio origin uri is not auto retryable: ${minioInfo.originUri}`);
        return;
    }
    await scheduleMinioRetry(minioId);
}

/**
 * 判断原始 URI 协议是否支持自动重试
 * @param {string} originUri - 原始资源 URI
 * @returns {boolean}
 */
function isAutoRetryProtocol(originUri) {
    try {
        return AUTO_RETRY_PROTOCOLS.includes(new URL(originUri).protocol);
    } catch {
        return false;
    }
}

/**
 * 登记一次自动重试（带去抖与指数退避；同一资源只保留一个待执行定时器）
 * @param {number} minioId - MinIO 资源 ID
 * @returns {Promise<void>}
 */
export async function scheduleMinioRetry(minioId) {
    if (pendingRetryTimers.has(minioId)) {
        __log.debug(`[${minioId}] Minio auto retry already scheduled, skip.`);
        return;
    }
    const now = Date.now();
    const record = await loadRetryRecord(minioId);
    if (record.attempt >= MINIO_RETRY_POLICY.maxAttempts) {
        const message = `Minio[${minioId}] auto retry reached max attempts(${MINIO_RETRY_POLICY.maxAttempts}), please handle it manually.`;
        __log.warn(message);
        pushNotification(message);
        return;
    }
    // 时间上限：自首次排期起算，与次数上限构成双终止条件（谁先到谁生效）
    const deadline = record.deadline ?? now + MINIO_RETRY_POLICY.maxRetryWindowMs;
    if (now >= deadline) {
        const message = `Minio[${minioId}] auto retry exceeded max window(${MINIO_RETRY_POLICY.maxRetryWindowMs}ms), please handle it manually.`;
        __log.warn(message);
        pushNotification(message);
        await retryStore.save(minioId, { attempt: record.attempt, dueAt: null, deadline });
        return;
    }
    const delay = Math.min(
        MINIO_RETRY_POLICY.baseDelayMs * MINIO_RETRY_POLICY.backoffFactor ** record.attempt,
        MINIO_RETRY_POLICY.maxDelayMs
    );
    const dueAt = now + delay;
    // 无论是否处于停机中，都先持久化排期意图；停机时仅跳过进程内定时器，
    // 交由下次启动的恢复扫描接续，避免关闭窗口内新产生的失败丢掉自动重试。
    await retryStore.save(minioId, { attempt: record.attempt, dueAt, deadline });
    if (shuttingDown) {
        __log.info(`[${minioId}] Process is shutting down, persist retry schedule only (next startup will resume it).`);
        return;
    }
    __log.info(`[${minioId}] Schedule minio auto retry in ${delay}ms (attempt ${record.attempt + 1}/${MINIO_RETRY_POLICY.maxAttempts}).`);
    const timer = setTimeout(() => {
        pendingRetryTimers.delete(minioId);
        executeMinioRetry(minioId);
    }, delay);
    timer.unref?.();
    pendingRetryTimers.set(minioId, timer);
}

/**
 * 取消已排期的自动重试定时器
 * @param {number} minioId - MinIO 资源 ID
 * @returns {void}
 */
export function cancelMinioRetry(minioId) {
    const timer = pendingRetryTimers.get(minioId);
    if (timer) {
        clearTimeout(timer);
        pendingRetryTimers.delete(minioId);
        __log.debug(`[${minioId}] Cancel pending minio auto retry.`);
    }
}

/**
 * 重置指定资源的自动重试计数（人工重试视为新一轮）
 * @param {number} minioId - MinIO 资源 ID
 * @returns {Promise<void>}
 */
export async function resetMinioRetryCounter(minioId) {
    cancelMinioRetry(minioId);
    await retryStore.remove(minioId);
}

/**
 * 执行一次自动重试：先原子认领状态（FAILED -> PREPARED），再交由本地执行器处理
 * @param {number} minioId - MinIO 资源 ID
 * @returns {Promise<void>}
 */
async function executeMinioRetry(minioId) {
    try {
        // 原子认领：仅当仍为 FAILED 时才推进状态，避免与人工操作/其它流程竞争
        const { rows } = await videoMinioRep.updateStatusByIdAndCurrentStatus(minioId, MEDIA_MINIO_STATUS.PREPARED, MEDIA_MINIO_STATUS.FAILED);
        if (rows === 0) {
            __log.info(`[${minioId}] Minio is no longer FAILED, skip this auto retry.`);
            return;
        }
        // 先落库计数与截止时间，保证即使此刻进程被杀，重启后也能接续而不是重置额度
        const record = await loadRetryRecord(minioId);
        const attempt = record.attempt + 1;
        await retryStore.save(minioId, {
            attempt,
            dueAt: null,
            deadline: record.deadline ?? Date.now() + MINIO_RETRY_POLICY.maxRetryWindowMs
        });
        __log.info(`[${minioId}] Execute minio auto retry, attempt ${attempt}/${MINIO_RETRY_POLICY.maxAttempts}.`);
        // 登记在跑任务，供停机时有限排空观测
        const running = executeAutoMinioRetry(minioId);
        inFlightRetries.add(running);
        let handled = false;
        try {
            handled = await running;
        } finally {
            inFlightRetries.delete(running);
        }
        if (!handled) {
            __log.warn(`[${minioId}] Minio still failed after auto retry, reschedule.`);
            await scheduleMinioRetry(minioId);
        }
    } catch (err) {
        __log.error(`[${minioId}] Minio auto retry error. Cause: ${err?.message ?? 'Unknown error'}`);
        await scheduleMinioRetry(minioId);
    }
}

/* ============================ 停机处理 ============================ */

/**
 * 取消全部已排期的自动重试定时器，并阻止后续再登记新重试（停机第一步：只保证不再发起新工作）
 * @returns {number} 被取消的定时器数量
 */
export function cancelAllPendingMinioRetries() {
    const count = pendingRetryTimers.size;
    for (const timer of pendingRetryTimers.values()) {
        clearTimeout(timer);
    }
    pendingRetryTimers.clear();
    shuttingDown = true;
    __log.info(`[MinioRetry] Shutdown: cancelled ${count} pending retry timer(s).`);
    return count;
}

/**
 * 有限等待正在执行中的自动重试结束。
 * 不做强杀：单次上传可能远超停机预算，超时未完成的交给「启动恢复扫描」兜底修复状态。
 * @param {number} [timeoutMs=5000] - 最长等待时间 (毫秒)
 * @returns {Promise<number>} 超时后仍在执行的任务数
 */
export async function drainInFlightMinioRetries(timeoutMs = 5000) {
    if (inFlightRetries.size === 0) return 0;
    __log.info(`[MinioRetry] Shutdown: waiting up to ${timeoutMs}ms for ${inFlightRetries.size} in-flight retry task(s).`);
    let timer = null;
    await Promise.race([
        Promise.allSettled([...inFlightRetries]),
        new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })
    ]);
    timer && clearTimeout(timer);
    const remaining = inFlightRetries.size;
    if (remaining > 0) {
        __log.warn(`[MinioRetry] Shutdown: ${remaining} retry task(s) still running, they will be recovered on next startup.`);
    }
    return remaining;
}

/**
 * 注册停机钩子（优先级 FIRST）：先停止登记新重试并取消待触发定时器，再有限等待在跑的重试。
 * 需在 `setupGlobal` 之后调用（依赖 globalThis.__shutdown）。
 * @param {number} [drainTimeoutMs=5000] - 排空等待上限 (毫秒)
 * @returns {boolean} 是否注册成功
 */
export function registerMinioRetryShutdownHook(drainTimeoutMs = 5000) {
    const shutdown = globalThis.__shutdown;
    if (!shutdown?.add) {
        __log.warn('[MinioRetry] globalThis.__shutdown is unavailable, skip shutdown hook registration.');
        return false;
    }
    shutdown.add(
        async () => {
            cancelAllPendingMinioRetries();
            await drainInFlightMinioRetries(drainTimeoutMs);
        },
        { name: 'MinioRetryShutdown', priority: SHUTDOWN_PRIORITY.FIRST }
    );
    __log.info(`[MinioRetry] Shutdown hook registered (drain timeout ${drainTimeoutMs}ms).`);
    return true;
}

/* ============================ 入库编排 ============================ */

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
export async function resolveStorageUri(uri, videoId, minioLink, minioId, type) {
    const typeDesc = MEDIA_TYPE_DESCRIPTION[type];
    const resolvedUri = generateUri(uri);
    resolvedUri === null && __throwMessage(`Uri invalid.`);
    const protocol = resolvedUri.protocol;
    if (FILE_PROTOCOL.includes(protocol)) {
        __log.info(`[${videoId}] Video's ${typeDesc} uri is a file, prepare move to minio: ${uri} -> ${minioLink}.`);
        const decodedFilePath = decodeURIComponent(resolvedUri.pathname);
        return async () => uploadFileToMinio(decodedFilePath, minioLink, minioId);
    } else if (HTTP_PROTOCOL.includes(protocol)) {
        const overSizeOneMB = await isRemoteUrlLargerThanOneMB(uri);
        // 无法获取大小或大于 1MB 时交给 aria2 下载，否则直接转存
        if (overSizeOneMB) {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a large size remote link, add aria2 task for download: ${uri} -> ${minioLink}.`);
            await addTask(uri, minioId, type);
            await transitionMinioStatus(minioId, MEDIA_MINIO_STATUS.DOWNLOADING, { source: MINIO_STATUS_SOURCE.INGEST });
        } else {
            __log.info(`[${videoId}] Video's ${typeDesc} uri is a tiny remote link, upload uri to minio: ${uri} -> ${minioLink}.`);
            return async () => {
                const complete = await uploadUrlToMinio(uri, minioLink, minioId);
                if (!complete) {
                    __log.info(`[${videoId}] Video's ${typeDesc} upload to minio failed, add aria2 task for download: ${uri} -> ${minioLink}.`);
                    await addTask(uri, minioId, type);
                    await transitionMinioStatus(minioId, MEDIA_MINIO_STATUS.DOWNLOADING, { source: MINIO_STATUS_SOURCE.INGEST });
                }
                return complete;
            };
        }
    } else {
        const message = `[${videoId}] Cannot resolve video ${typeDesc} uri: ${uri}`;
        __log.warn(message);
        pushNotification(message);
        await transitionMinioStatus(minioId, MEDIA_MINIO_STATUS.FAILED, { source: MINIO_STATUS_SOURCE.INGEST });
    }
    return null;
}

/**
 * 执行本地文件上传至 MinIO 并流转状态
 * @param {string} filePath - 本地文件路径
 * @param {string} minioLink - MinIO 目标链接
 * @param {number} lastId - video_minio 主键 ID
 * @returns {Promise<boolean>}
 */
async function uploadFileToMinio(filePath, minioLink, lastId) {
    await transitionMinioStatus(lastId, MEDIA_MINIO_STATUS.UPLOADING, { source: MINIO_STATUS_SOURCE.INGEST });
    // 本地文件拷贝刻意不设超时，完全交由人工控制：
    // 1) 文件体量不可预知，且 mc 拷贝期间无任何进度输出（--quiet），任何阈值都可能误杀健康的大文件；
    // 2) file: 协议不参与自动重试，被误杀会直接导致永久失败；
    // 3) 进程意外退出不影响物理文件，人工重试会直接覆盖 MinIO 上的目标对象，无需自动兜底。
    const complete = await copyLocalFileToMinio(filePath, minioLink);
    const minioStatus = complete ? MEDIA_MINIO_STATUS.COMPLETE : MEDIA_MINIO_STATUS.FAILED;
    await transitionMinioStatus(lastId, minioStatus, { source: MINIO_STATUS_SOURCE.INGEST });
    complete && await tryBackfillObjectSize(lastId);
    return complete;
}

/**
 * 执行网络 URL 抓取并上传至 MinIO 并流转状态
 * @param {string} url - 远程 URL
 * @param {string} minioLink - MinIO 目标链接
 * @param {number} lastId - video_minio 主键 ID
 * @returns {Promise<boolean>}
 */
async function uploadUrlToMinio(url, minioLink, lastId) {
    const complete = await downloadUrlToMinio(url, minioLink, { timeoutMs: MINIO_RETRY_POLICY.remoteDownloadTimeoutMs });
    const minioStatus = complete ? MEDIA_MINIO_STATUS.COMPLETE : MEDIA_MINIO_STATUS.FAILED;
    await transitionMinioStatus(lastId, minioStatus, { source: MINIO_STATUS_SOURCE.INGEST });
    complete && await tryBackfillObjectSize(lastId);
    return complete;
}

/* ============================ 视频状态推导 ============================ */

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

/**
 * 汇总并刷新视频关联 MinIO 对象的总容量大小
 * @param {number} videoId - 视频 ID
 * @returns {Promise<void>}
 */
export async function tryUpdateVideoTotalSize(videoId) {
    try {
        const totalSize = await videoMinioRep.selectTotalSizeByVideoId(videoId);
        totalSize && await videosRep.updateTotalSize(videoId, totalSize);
    } catch (err) {
        __log.error(`[${videoId}] Update video total size failed. Cause: ${err.message ?? 'Unknown error'}`);
    }
}

/* ============================ 重试执行 ============================ */

/** 仍处于下载中的 aria2 任务状态（存在时不允许重试，避免打断正在进行的下载） */
const ARIA2_TASK_IN_FLIGHT_STATUS = [
    MEDIA_ARIA2_TASK_STATUS.PREPARED,
    MEDIA_ARIA2_TASK_STATUS.DOWNLOADING
];

/**
 * 清理指定 MinIO 资源上次失败遗留的 aria2 任务
 * 复用 removeTask：移除 aria2 remote 任务 + 本地断点文件 + aria2_task 记录行
 * @param {number} minioId - MinIO ID
 * @returns {Promise<boolean>} 是否清理完成，false 表示仍有任务在下载中
 */
async function cleanupAria2TasksForRetry(minioId) {
    const aria2Tasks = await aria2TaskRep.selectByMinioId(minioId).then(({ data }) => data);
    if (__isEmptyArray(aria2Tasks)) return true;
    if (aria2Tasks.some(task => ARIA2_TASK_IN_FLIGHT_STATUS.includes(task.status))) {
        __log.warn(`[${minioId}] Minio can not retry, cause aria2 task is still downloading.`);
        return false;
    }
    for (const { id } of aria2Tasks) {
        await removeTask(id);
    }
    return true;
}

/**
 * 执行一次 MinIO 入库解析（前提：失败遗留的 aria2 任务已清理）
 * @param {{ id: number, videoId: number, originUri: string, type: number, link: string }} minioInfo - MinIO 资源信息
 * @param {{ detach?: boolean }} [options={}] - detach=true 沿用「异步任务链 + 超时提前返回」语义（人工重试的 HTTP 入口需要及时返回，故仍会返回 timedOut）；
 *                                              detach=false 完整等待上传结束（自动重试使用，避免工作游离到后台、无法被停机与恢复流程观测）
 * @returns {Promise<{ timedOut: boolean }>} 是否因超时提前返回（仅 detach=true 时可能为 true）
 */
async function runMinioIngest(minioInfo, options = {}) {
    const { detach = false } = options;
    const { id, videoId, originUri, type, link } = minioInfo;
    const task = await resolveStorageUri(originUri, videoId, link, id, type);
    if (task === null) {
        await updateVideoStatusByVideoMinioStatus(videoId);
        return { timedOut: false };
    }
    if (!detach) {
        // 自动重试：不游离后台，完整等待，执行器返回即代表工作真正结束
        await task();
        await updateVideoStatusByVideoMinioStatus(videoId);
        return { timedOut: false };
    }
    const uploadTimeout = await getMediaUploadTimeoutOption();
    const { status } = await executeAsyncTaskChain([
        task,
        async () => updateVideoStatusByVideoMinioStatus(videoId)
    ], uploadTimeout);
    return { timedOut: status === ASYNC_SEQUENCE_EXECUTE_STATUS.TIMEOUT };
}

/**
 * 自动重试执行器：清理旧任务后重跑一次入库
 * @param {number} minioId - MinIO ID
 * @returns {Promise<boolean>} true 表示已接管（状态已推进，无需再次排期），false 表示仍为失败态
 */
async function executeAutoMinioRetry(minioId) {
    const minioInfo = await videoMinioRep.selectOneById(minioId);
    if (!minioInfo) return true;
    const cleaned = await cleanupAria2TasksForRetry(minioId);
    if (!cleaned) {
        // 已有任务在下载中，说明状态已被其它流程接管
        return true;
    }
    await runMinioIngest(minioInfo, { detach: false });
    const latest = await videoMinioRep.selectOneById(minioId);
    return latest?.status !== MEDIA_MINIO_STATUS.FAILED;
}

/**
 * 重新尝试执行失败的 MinIO 资源上传（人工触发，会重置自动重试计数）
 * @param {number} minioId - MinIO ID
 * @returns {Promise<number>} 1 成功，0 超时
 */
export async function retryMinio(minioId) {
    const result = await videoMinioRep.selectOneById(minioId);
    result || __throwMessage('Minio not found.');
    const { id, status } = result;
    status !== MEDIA_MINIO_STATUS.FAILED && __throwMessage('Minio can not retry.');
    // 人工重试视为新一轮，重置计数与已排期的自动重试
    await resetMinioRetryCounter(id);
    const cleaned = await cleanupAria2TasksForRetry(id);
    cleaned || __throwMessage('Minio can not retry, cause aria2 task is still downloading.');
    const { timedOut } = await runMinioIngest(result, { detach: true });
    return timedOut ? 0 : 1;
}

/* ============================ 启动恢复扫描 ============================ */

/** aria2 中仍存活（可能仍在下载）的任务状态 */
const ARIA2_ALIVE_STATUS = ['active', 'waiting', 'paused'];

/** 无 aria2 任务时即判定为孤儿的 MinIO 状态（DOWNLOADING 由第 1 步的 aria2 对账负责） */
const NON_TERMINAL_MINIO_STATUS = [
    MEDIA_MINIO_STATUS.PREPARED,
    MEDIA_MINIO_STATUS.UPLOADING
];

/** @type {boolean} 恢复扫描防重入标记 */
let recovering = false;

/**
 * 启动恢复扫描：修复进程被杀留下的中断残留，并补回丢失的自动重试排期。
 *
 * 处理三类问题：
 * 1. aria2 任务对账：DB 中仍标记为「进行中」但 aria2 侧已失效（GID 不存在或 error）的任务 → 清理并把资源标回 FAILED；
 *    若 aria2 不可达则跳过对账（宁可不处理，也不能误杀仍在下载的任务）。
 * 2. 无存活 aria2 任务的孤儿：处于 PREPARED/UPLOADING 但已无 in-flight aria2 任务
 *    （可能残留 COMPLETE/FAILED 的任务行）→ 标回 FAILED；覆盖"下载完成但切片上传从未发生"的卡死场景。
 * 3. 补排期：消费持久化存储中的待恢复项，按剩余退避重新登记重试（次数与 deadline 均已持久化，不会重置额度）。
 *
 * 必须在开始接受流量之前调用一次（application start() 中、startServer() 之前），以免与新的入库流程竞争。
 * 注意：status 无索引，本方法会产生全表扫描，仅限启动阶段调用。
 * @returns {Promise<{ recovered: number, cleanedTasks: number, rescheduled: number, aria2Reconciled: boolean }>} 恢复统计
 */
export async function recoverMinioIngestRetries() {
    const summary = { recovered: 0, cleanedTasks: 0, rescheduled: 0, aria2Reconciled: false };
    if (recovering) {
        __log.warn('[MinioRecovery] Recovery already running, skip this invocation.');
        return summary;
    }
    recovering = true;
    __log.info('[MinioRecovery] Startup recovery scan begin.');
    try {
        // 1. aria2 任务对账
        const { data: inFlightTasks } = await aria2TaskRep.selectByStatuses(ARIA2_TASK_IN_FLIGHT_STATUS);
        if (__isNotEmptyArray(inFlightTasks)) {
            const gidStatusMap = await getGidStatusMap(inFlightTasks.map(task => task.gid));
            if (gidStatusMap === null) {
                __log.warn('[MinioRecovery] Aria2 unreachable, skip task reconciliation to avoid killing live downloads.');
            } else {
                summary.aria2Reconciled = true;
                const grouped = new Map();
                for (const task of inFlightTasks) {
                    if (!grouped.has(task.minioId)) grouped.set(task.minioId, []);
                    grouped.get(task.minioId).push(task);
                }
                for (const [minioId, taskList] of grouped) {
                    let aliveCount = 0;
                    for (const task of taskList) {
                        const status = gidStatusMap.has(task.gid) ? gidStatusMap.get(task.gid) : undefined;
                        // 未取到状态时保守视为存活；只有明确非存活才清理
                        if (status === undefined || ARIA2_ALIVE_STATUS.includes(status)) {
                            aliveCount++;
                            continue;
                        }
                        __log.warn(`[MinioRecovery] Minio[${minioId}] aria2 task gid=${task.gid} is dead (status=${status ?? 'not-found'}), cleaning.`);
                        await removeTask(task.id);
                        summary.cleanedTasks++;
                    }
                    if (aliveCount > 0) continue;   // 仍有任务在下载，交由 aria2 回调流程处理
                    const minioInfo = await videoMinioRep.selectOneById(minioId);
                    if (!minioInfo) continue;
                    if (minioInfo.status === MEDIA_MINIO_STATUS.COMPLETE || minioInfo.status === MEDIA_MINIO_STATUS.REMOVED) {
                        // 任务残留但资源已终态，仅清理任务，不改写状态（避免复活已删除/已完成资源）
                        __log.info(`[MinioRecovery] Minio[${minioId}] already status=${minioInfo.status}, keep it and only clean tasks.`);
                        continue;
                    }
                    await transitionMinioStatus(minioId, MEDIA_MINIO_STATUS.FAILED, { source: MINIO_STATUS_SOURCE.RECOVERY });
                    summary.recovered++;
                }
            }
        }

        // 2. 无存活 aria2 任务的非终态孤儿（腰斩在上传/准备阶段，或下载已完成但切片上传从未发生）
        const { data: orphans } = await videoMinioRep.selectByStatuses(NON_TERMINAL_MINIO_STATUS);
        if (__isNotEmptyArray(orphans)) {
            const { data: orphanTasks } = await aria2TaskRep.selectByMinioIds(orphans.map(o => o.id));
            // 只跳过「仍有 in-flight 任务」的记录：aria2_task 行在下载完成后不会被删除（status 变 COMPLETE），
            // 若按「存在任何任务行」跳过，UPLOADING + aria2_task(COMPLETE) 这类孤儿将永远无法恢复。
            const minioIdsWithInFlightTask = new Set((orphanTasks ?? [])
                .filter(task => ARIA2_TASK_IN_FLIGHT_STATUS.includes(task.status))
                .map(task => task.minioId));
            for (const orphan of orphans) {
                if (minioIdsWithInFlightTask.has(orphan.id)) continue;
                __log.warn(`[MinioRecovery] Minio[${orphan.id}] is a non-terminal orphan (status=${orphan.status}), reset to FAILED.`);
                await transitionMinioStatus(orphan.id, MEDIA_MINIO_STATUS.FAILED, { source: MINIO_STATUS_SOURCE.RECOVERY });
                summary.recovered++;
            }
        }

        // 3. 补回丢失的排期（次数与 deadline 已持久化，不会重置额度）
        const pending = await listPendingMinioRetries();
        for (const item of pending) {
            const info = await videoMinioRep.selectOneById(item.minioId);
            if (!info || info.status !== MEDIA_MINIO_STATUS.FAILED) {
                // 已不在失败态（成功/被移除），清理残留的重试状态
                await retryStore.remove(item.minioId);
                continue;
            }
            await scheduleMinioRetry(item.minioId);
            summary.rescheduled++;
        }
    } catch (err) {
        __log.error(`[MinioRecovery] Recovery scan failed. Cause: ${err?.message ?? 'Unknown error'}`);
    } finally {
        recovering = false;
    }
    __log.info(`[MinioRecovery] Startup recovery scan done. recovered=${summary.recovered}, cleanedTasks=${summary.cleanedTasks}, rescheduled=${summary.rescheduled}, aria2Reconciled=${summary.aria2Reconciled}.`);
    return summary;
}
