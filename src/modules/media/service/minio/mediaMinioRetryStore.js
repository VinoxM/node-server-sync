import { getRedisClient } from "#core/database/index.js";
import { setMinioRetryStore, recoverMinioIngestRetries, registerMinioRetryShutdownHook } from "./mediaMinioStateService.js";

/**
 * MinIO 重试状态 Redis 持久化存储（独立模块，供启动阶段预加载）
 *
 * 责任：把「某个 video_minio 的自动重试状态」持久化到 Redis，使进程重启后仍可恢复：
 *   - attempt   已重试次数
 *   - dueAt     下次重试的绝对时间戳 (ms)，null 表示当前无待执行排期
 *   - deadline  放弃自动重试的绝对截止时间戳 (ms)
 *
 * 键设计（均带 TTL，仅作孤儿状态的回收兜底，不作为终止依据）：
 *   media:minio:retry:{minioId}   String(JSON)  单条重试状态
 *   media:minio:retry:index       ZSet          member=minioId, score=dueAt（按到期顺序列出待恢复项）
 *
 * 降级策略：Redis 未启用 / 不可用 / 熔断时，initialize 返回 false，状态机继续使用内存实现，
 * 不阻断入库主流程，仅失去「跨重启恢复」能力。
 */

/** 默认 TTL（秒），需大于「重试总窗口 + 可容忍停机时长」 */
export const MINIO_RETRY_STORE_TTL_SECONDS = 24 * 60 * 60;

const KEY_PREFIX = 'media:minio:retry';
/** 待恢复索引（ZSet） */
const INDEX_KEY = `${KEY_PREFIX}:index`;
/** 可用性探测键（普通 String，避免与 ZSet 键类型冲突） */
const PROBE_KEY = `${KEY_PREFIX}:__probe__`;
/** 删除单条记录的 Lua 脚本（Redis 封装未提供 del 命令） */
const DELETE_SCRIPT = 'redis.call("DEL", KEYS[1]) return 1';

/**
 * 重试状态记录
 * @typedef {Object} MinioRetryRecord
 * @property {number} attempt - 已重试次数
 * @property {number|null} dueAt - 下次重试绝对时间戳 (ms)
 * @property {number|null} deadline - 放弃重试绝对时间戳 (ms)
 */

/**
 * 基于 Redis 的 MinIO 重试状态存储实现（对应 mediaMinioStateService 的 MinioRetryStore 接口）
 */
export class RedisMinioRetryStore {
    /** @type {number} 记录 TTL（秒） */
    #ttlSeconds;

    /** @type {boolean} 是否已完成可用性探测并启用 */
    #initialized = false;

    /**
     * 本地镜像缓存：Redis 读写失败时兜底，避免降级瞬间计数归零导致重试放大
     * @type {Map<number, MinioRetryRecord>}
     */
    #cache = new Map();

    /**
     * @param {number} [ttlSeconds=MINIO_RETRY_STORE_TTL_SECONDS] - 记录 TTL（秒）
     */
    constructor(ttlSeconds = MINIO_RETRY_STORE_TTL_SECONDS) {
        this.#ttlSeconds = Number.isInteger(ttlSeconds) && ttlSeconds > 0 ? ttlSeconds : MINIO_RETRY_STORE_TTL_SECONDS;
    }

    /**
     * 是否已启用
     * @returns {boolean}
     */
    get initialized() {
        return this.#initialized;
    }

    /**
     * 当前生效的记录 TTL（秒）
     * @returns {number}
     */
    get ttlSeconds() {
        return this.#ttlSeconds;
    }

    /**
     * 探测 Redis 可用性并标记启用状态
     * Redis 连接是异步建立的（disableOfflineQueue=true，未 ready 时命令会被拒绝），
     * 因此这里做有限重试，避免启动过早导致误判为不可用而永久退回内存实现。
     * @param {{ attempts?: number, intervalMs?: number }} [options={}] - 探测重试配置
     * @returns {Promise<boolean>} 是否可用
     */
    async initialize(options = {}) {
        const { attempts = 5, intervalMs = 800 } = options;
        for (let i = 0; i < attempts; i++) {
            const redis = getRedisClient();
            if (!redis) {
                this.#initialized = false;
                return false;
            }
            const probe = await redis.get(PROBE_KEY);
            if (probe.code === 0) {
                this.#initialized = true;
                return true;
            }
            if (i < attempts - 1) {
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }
        this.#initialized = false;
        return false;
    }

    /**
     * 单条重试状态的键名
     * @param {number} minioId - MinIO 资源 ID
     * @returns {string}
     */
    #dataKey(minioId) {
        return `${KEY_PREFIX}:${minioId}`;
    }

    /**
     * 读取指定资源的重试状态
     * Redis 读取失败（含熔断）时回退到本地镜像缓存。
     * @param {number} minioId - MinIO 资源 ID
     * @returns {Promise<MinioRetryRecord|null>}
     */
    async load(minioId) {
        const redis = getRedisClient();
        if (!redis) return this.#cache.get(minioId) ?? null;
        const res = await redis.get(this.#dataKey(minioId));
        if (res.code !== 0) {
            return this.#cache.get(minioId) ?? null;
        }
        if (!res.data) {
            this.#cache.delete(minioId);
            return null;
        }
        try {
            const record = JSON.parse(res.data);
            this.#cache.set(minioId, record);
            return record;
        } catch {
            return null;
        }
    }

    /**
     * 覆盖写入指定资源的重试状态（写穿：先更新本地镜像，再写 Redis）
     * @param {number} minioId - MinIO 资源 ID
     * @param {MinioRetryRecord} record - 重试状态
     * @returns {Promise<void>}
     */
    async save(minioId, record) {
        const { attempt = 0, dueAt = null, deadline = null } = record ?? {};
        const normalized = { attempt, dueAt, deadline };
        this.#cache.set(minioId, normalized);
        const redis = getRedisClient();
        if (!redis) return;
        const dataKey = this.#dataKey(minioId);
        const res = await redis.set(dataKey, JSON.stringify(normalized), this.#ttlSeconds);
        if (res.code !== 0) {
            __log.warn(`[MinioRetryStore] Save retry state failed for minio[${minioId}], fallback to local cache. ${res.msg}`);
            return;
        }
        if (dueAt !== null) {
            await redis.zAdd(INDEX_KEY, dueAt, String(minioId));
        } else {
            await redis.zRem(INDEX_KEY, String(minioId));
        }
        await redis.expire(INDEX_KEY, this.#ttlSeconds);
    }

    /**
     * 删除指定资源的重试状态
     * @param {number} minioId - MinIO 资源 ID
     * @returns {Promise<void>}
     */
    async remove(minioId) {
        this.#cache.delete(minioId);
        const redis = getRedisClient();
        if (!redis) return;
        await redis.eval(DELETE_SCRIPT, [this.#dataKey(minioId)]);
        await redis.zRem(INDEX_KEY, String(minioId));
    }

    /**
     * 从本地镜像缓存列出待恢复项（按 dueAt 升序）
     * @returns {Array<{ minioId: number } & MinioRetryRecord>}
     */
    #listFromCache() {
        return Array.from(this.#cache, ([minioId, record]) => ({ minioId, ...record }))
            .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0));
    }

    /**
     * 列出全部待恢复的重试状态（按 dueAt 升序）
     * 供启动阶段恢复排期使用；索引中已过期的成员会被顺手清理；Redis 不可用时回退本地镜像。
     * @returns {Promise<Array<{ minioId: number } & MinioRetryRecord>>}
     */
    async listPending() {
        const redis = getRedisClient();
        if (!redis) return this.#listFromCache();
        const res = await redis.zRange(INDEX_KEY, 0, -1);
        if (res.code !== 0) return this.#listFromCache();
        if (!Array.isArray(res.data) || res.data.length === 0) return [];
        const items = [];
        for (const member of res.data) {
            const minioId = parseInt(String(member));
            if (isNaN(minioId)) continue;
            const record = await this.load(minioId);
            if (!record) {
                // 数据键已过期但索引残留，顺手清理
                await redis.zRem(INDEX_KEY, String(member));
                continue;
            }
            items.push({ minioId, ...record });
        }
        return items;
    }
}

/**
 * 初始化并启用 Redis 重试存储（在启动阶段与其他服务按序调用）
 * Redis 不可用时返回 false 并保持内存实现，不抛异常。
 * @param {{ ttlSeconds?: number, attempts?: number, intervalMs?: number }} [options={}] - 可选配置
 * @returns {Promise<boolean>} 是否成功启用 Redis 存储
 */
export async function initializeMinioRetryStore(options = {}) {
    const store = new RedisMinioRetryStore(options.ttlSeconds);
    let enabled = false;
    try {
        enabled = await store.initialize(options);
    } catch (err) {
        __log.error(`[MinioRetryStore] Initialize failed. Cause: ${err?.message ?? err}`);
        enabled = false;
    }
    if (!enabled) {
        __log.warn('[MinioRetryStore] Redis unavailable, keep in-memory retry store (retry state will not survive restart).');
        return false;
    }
    setMinioRetryStore(store);
    __log.info(`[MinioRetryStore] Redis retry store enabled. ttl=${store.ttlSeconds}s`);
    return true;
}

/**
 * MinIO 重试启动引导（程序启动时调用一次）
 * 顺序：① 探测并启用 Redis 持久化存储 → ② 注册停机钩子 → ③ 执行启动恢复扫描（aria2 对账 + 孤儿修复 + 补排期）
 *
 * 必须在 startServer() 之前调用：既保证首次入库前存储已就绪，也保证恢复过程不与新入库流程竞争。
 * Redis 不可用时仅退化为「无跨重启恢复」，恢复扫描本身仍会执行。
 * @param {{ ttlSeconds?: number, attempts?: number, intervalMs?: number, drainTimeoutMs?: number }} [options={}] - 可选配置
 * @returns {Promise<{ persistent: boolean, shutdownHookRegistered: boolean, recovered: number, cleanedTasks: number, rescheduled: number, aria2Reconciled: boolean }>} 启动结果与恢复统计
 */
export async function initializeMinioRetry(options = {}) {
    const persistent = await initializeMinioRetryStore(options);
    // 先注册停机钩子，保证恢复扫描期间收到 SIGTERM 也能正确取消/排空
    const shutdownHookRegistered = registerMinioRetryShutdownHook(options.drainTimeoutMs);
    const summary = await recoverMinioIngestRetries();
    return { persistent, shutdownHookRegistered, ...summary };
}
