import { getRedisClient } from '#core/database/index.js';

/**
 * @typedef {import('#types/progressTypes.d.ts').MediaProgressPayload} MediaProgressPayload
 * @typedef {import('#types/progressTypes.d.ts').ProgressStoreOptions} ProgressStoreOptions
 * @typedef {import('#types/progressTypes.d.ts').RecentProgressListResult} RecentProgressListResult
 */

/**
 * 媒体播放进度存储管理服务 (基于 Redis "Hash 详情 + ZSet 时间线" 双结构实现)
 * 将平台 (platform) 与用户 (userId) 组合作为命名空间 Key，实现不同平台、不同用户的数据强隔离
 */
export class ProgressStore {
    /** @type {ProgressStoreOptions} */
    #options;

    /**
     * @param {ProgressStoreOptions} [options={}] - 配置选项
     */
    constructor(options = {}) {
        this.#options = {
            prefix: options.prefix ?? 'media',
            ttlSeconds: options.ttlSeconds ?? 90 * 24 * 3600,
            maxHistoryLimit: options.maxHistoryLimit ?? 200,
            finishedThreshold: options.finishedThreshold ?? 0.95
        };
    }

    /**
     * 生成播放进度 Hash 表的 Redis Key
     * 结构规则：`{prefix}:progress:{platform}:{userId}`
     * @param {string|number} platform - 平台标识
     * @param {string|number} userId - 用户 ID
     * @returns {string}
     */
    #getHashKey(platform, userId) {
        return `${this.#options.prefix}:progress:${platform}:${userId}`;
    }

    /**
     * 生成播放时间线 ZSet 表的 Redis Key
     * 结构规则：`{prefix}:timeline:{platform}:{userId}`
     * @param {string|number} platform - 平台标识
     * @param {string|number} userId - 用户 ID
     * @returns {string}
     */
    #getTimelineKey(platform, userId) {
        return `${this.#options.prefix}:timeline:${platform}:${userId}`;
    }

    /**
     * 保存或更新播放进度
     * 包含防脏数据校验、完播状态判定、Hash 写入、ZSet 时间轴更新、TTL 滑动续期与超限自动裁剪
     * @param {MediaProgressPayload} payload - 播放进度载荷
     * @returns {Promise<boolean>} 是否成功保存
     */
    async saveProgress(payload) {
        const redis = getRedisClient();
        if (!redis) return false;

        const { platform, userId, videoId, currentTime, duration, extra = {} } = payload || {};
        if (__isAnyBlank(platform, userId, videoId)) {
            __log.warn('[ProgressStore] Missing required fields (platform, userId, videoId) in saveProgress.');
            return false;
        }

        const now = Date.now();
        const safeDuration = Math.max(0, Number(duration) || 0);
        const rawCurrent = Math.max(0, Number(currentTime) || 0);
        const safeCurrent = safeDuration > 0 ? Math.min(rawCurrent, safeDuration) : rawCurrent;
        const percentage = safeDuration > 0 ? Number((safeCurrent / safeDuration).toFixed(4)) : 0;
        const isFinished = safeDuration > 0 && percentage >= this.#options.finishedThreshold;

        const record = {
            platform: String(platform),
            userId: String(userId),
            videoId: String(videoId),
            currentTime: Number(safeCurrent.toFixed(2)),
            duration: Number(safeDuration.toFixed(2)),
            percentage,
            isFinished,
            updatedAt: now,
            extra: typeof extra === 'object' && extra !== null ? extra : {}
        };

        const hashKey = this.#getHashKey(platform, userId);
        const timelineKey = this.#getTimelineKey(platform, userId);
        const videoIdStr = String(videoId);
        const recordJson = JSON.stringify(record);

        // 1. 写入 Hash 详细记录
        const hashRes = await redis.hSet(hashKey, videoIdStr, recordJson);
        if (hashRes.code !== 0) {
            __log.error(`[ProgressStore] Failed to hSet progress for [${platform}:${userId}:${videoId}]: ${hashRes.msg}`);
            return false;
        }

        // 2. 更新 ZSet 时间戳索引
        await redis.zAdd(timelineKey, now, videoIdStr);

        // 3. 滑动刷新键的有效生存时间 (TTL)
        await Promise.all([
            redis.expire(hashKey, this.#options.ttlSeconds),
            redis.expire(timelineKey, this.#options.ttlSeconds)
        ]);

        // 4. 异步清理超出最大条数限制的最早数据
        this.#trimHistory(platform, userId).catch(err => {
            __log.error(`[ProgressStore] Trim history failed for [${platform}:${userId}]: ${err.message || err}`);
        });

        return true;
    }

    /**
     * 获取单个视频的播放进度 (断点续播)
     * @param {string|number} platform - 平台标识
     * @param {string|number} userId - 用户 ID
     * @param {string|number} videoId - 视频 ID
     * @returns {Promise<MediaProgressPayload|null>} 播放进度对象，不存在时返回 null
     */
    async getProgress(platform, userId, videoId) {
        const redis = getRedisClient();
        if (!redis || __isAnyBlank(platform, userId, videoId)) return null;

        const hashKey = this.#getHashKey(platform, userId);
        const res = await redis.hGet(hashKey, String(videoId));

        if (res.code === 0 && res.data) {
            try {
                return JSON.parse(res.data);
            } catch (err) {
                __log.error(`[ProgressStore] Parse JSON error for [${platform}:${userId}:${videoId}]: ${err.message}`);
                return null;
            }
        }
        return null;
    }

    /**
     * 批量查询一组视频的播放进度 (用于合集/列表页面进度条批量渲染)
     * @param {string|number} platform - 平台标识
     * @param {string|number} userId - 用户 ID
     * @param {Array<string|number>} videoIds - 视频 ID 数组
     * @returns {Promise<Record<string, MediaProgressPayload>>} 以 videoId 为键的进度字典映射
     */
    async batchGetProgress(platform, userId, videoIds) {
        const redis = getRedisClient();
        if (!redis || __isAnyBlank(platform, userId) || !Array.isArray(videoIds) || videoIds.length === 0) {
            return {};
        }

        const hashKey = this.#getHashKey(platform, userId);
        const validIds = videoIds.filter(id => !__isBlank(id)).map(String);
        if (validIds.length === 0) return {};

        const luaScript = `
            local results = {}
            for i, videoId in ipairs(ARGV) do
                local val = redis.call('HGET', KEYS[1], videoId)
                results[i] = val or false
            end
            return results
        `;

        const evalRes = await redis.eval(luaScript, [hashKey], validIds);
        const resultMap = {};

        if (evalRes.code === 0 && Array.isArray(evalRes.data)) {
            evalRes.data.forEach((item, index) => {
                const vid = validIds[index];
                if (item && typeof item === 'string') {
                    try {
                        resultMap[vid] = JSON.parse(item);
                    } catch {
                        resultMap[vid] = null;
                    }
                }
            });
        }

        return resultMap;
    }

    /**
     * 分页查询指定平台和用户的最近播放历史列表 (按播放时间倒序排列)
     * @param {string|number} platform - 平台标识
     * @param {string|number} userId - 用户 ID
     * @param {number} [pageNum=1] - 当前页码 (从 1 开始)
     * @param {number} [pageSize=20] - 每页条数
     * @returns {Promise<RecentProgressListResult>}
     */
    async getRecentList(platform, userId, pageNum = 1, pageSize = 20) {
        const redis = getRedisClient();
        if (!redis || __isAnyBlank(platform, userId)) {
            return { total: 0, pageNum, pageSize, list: [] };
        }

        const safePageNum = Math.max(1, Number(pageNum) || 1);
        const safePageSize = Math.max(1, Number(pageSize) || 20);
        const start = (safePageNum - 1) * safePageSize;
        const stop = start + safePageSize - 1;

        const timelineKey = this.#getTimelineKey(platform, userId);
        const hashKey = this.#getHashKey(platform, userId);

        const cardRes = await redis.zCard(timelineKey);
        const total = (cardRes.code === 0 && Number.isInteger(cardRes.data)) ? cardRes.data : 0;
        if (total === 0) {
            return { total: 0, pageNum: safePageNum, pageSize: safePageSize, list: [] };
        }

        // 使用 Lua 脚本原子按时间戳倒序获取成员并批量拉取 Hash 详情
        const luaScript = `
            local fields = redis.call('ZREVRANGE', KEYS[1], ARGV[1], ARGV[2])
            if #fields == 0 then return {} end
            local results = {}
            for _, field in ipairs(fields) do
                local val = redis.call('HGET', KEYS[2], field)
                if val then
                    table.insert(results, val)
                end
            end
            return results
        `;

        const evalRes = await redis.eval(luaScript, [timelineKey, hashKey], [String(start), String(stop)]);
        const list = [];

        if (evalRes.code === 0 && Array.isArray(evalRes.data)) {
            for (const item of evalRes.data) {
                try {
                    list.push(JSON.parse(item));
                } catch {
                    // 忽略异常数据
                }
            }
        }

        return {
            total,
            pageNum: safePageNum,
            pageSize: safePageSize,
            list
        };
    }

    /**
     * 跨多个平台聚合查询用户的最近播放历史 (多路合并排序)
     * @param {Array<string|number>} platforms - 平台列表 (如 ['bilibili', 'emby', 'local'])
     * @param {string|number} userId - 用户 ID
     * @param {number} [pageNum=1] - 页码
     * @param {number} [pageSize=20] - 每页条数
     * @returns {Promise<RecentProgressListResult>}
     */
    async getAllRecentList(platforms, userId, pageNum = 1, pageSize = 20) {
        if (!Array.isArray(platforms) || platforms.length === 0 || __isBlank(userId)) {
            return { total: 0, pageNum, pageSize, list: [] };
        }

        const safePageNum = Math.max(1, Number(pageNum) || 1);
        const safePageSize = Math.max(1, Number(pageSize) || 20);

        // 并行获取各平台的前 N 条数据（取到当前分页所需的总量）
        const fetchLimit = safePageNum * safePageSize;
        const results = await Promise.all(
            platforms.map(platform => this.getRecentList(platform, userId, 1, fetchLimit))
        );

        let total = 0;
        const aggregatedList = [];
        for (const res of results) {
            total += res.total;
            aggregatedList.push(...res.list);
        }

        // 按 updatedAt 降序排序
        aggregatedList.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

        const start = (safePageNum - 1) * safePageSize;
        const pagedList = aggregatedList.slice(start, start + safePageSize);

        return {
            total,
            pageNum: safePageNum,
            pageSize: safePageSize,
            list: pagedList
        };
    }

    /**
     * 删除指定的一个或多个视频播放记录
     * @param {string|number} platform - 平台标识
     * @param {string|number} userId - 用户 ID
     * @param {string|number|Array<string|number>} videoIds - 单个或多个视频 ID
     * @returns {Promise<boolean>} 是否成功删除
     */
    async deleteProgress(platform, userId, videoIds) {
        const redis = getRedisClient();
        if (!redis || __isAnyBlank(platform, userId)) return false;

        const ids = (Array.isArray(videoIds) ? videoIds : [videoIds])
            .filter(id => !__isBlank(id))
            .map(String);

        if (ids.length === 0) return true;

        const hashKey = this.#getHashKey(platform, userId);
        const timelineKey = this.#getTimelineKey(platform, userId);

        const luaScript = `
            for _, field in ipairs(ARGV) do
                redis.call('HDEL', KEYS[1], field)
                redis.call('ZREM', KEYS[2], field)
            end
            return 1
        `;

        const evalRes = await redis.eval(luaScript, [hashKey, timelineKey], ids);
        return evalRes.code === 0;
    }

    /**
     * 清空指定用户在某个平台下的所有播放进度与历史记录
     * @param {string|number} platform - 平台标识
     * @param {string|number} userId - 用户 ID
     * @returns {Promise<boolean>} 是否成功清空
     */
    async clearPlatformProgress(platform, userId) {
        const redis = getRedisClient();
        if (!redis || __isAnyBlank(platform, userId)) return false;

        const hashKey = this.#getHashKey(platform, userId);
        const timelineKey = this.#getTimelineKey(platform, userId);

        const luaScript = `
            redis.call('DEL', KEYS[1], KEYS[2])
            return 1
        `;

        const evalRes = await redis.eval(luaScript, [hashKey, timelineKey], []);
        return evalRes.code === 0;
    }

    /**
     * 获取指定用户在某平台下的历史记录总条数
     * @param {string|number} platform - 平台标识
     * @param {string|number} userId - 用户 ID
     * @returns {Promise<number>}
     */
    async getProgressCount(platform, userId) {
        const redis = getRedisClient();
        if (!redis || __isAnyBlank(platform, userId)) return 0;

        const timelineKey = this.#getTimelineKey(platform, userId);
        const res = await redis.zCard(timelineKey);
        return (res.code === 0 && Number.isInteger(res.data)) ? res.data : 0;
    }

    /**
     * 内部异步淘汰：裁剪超出最大历史限制条数 (maxHistoryLimit) 的早期数据
     * @param {string|number} platform
     * @param {string|number} userId
     */
    async #trimHistory(platform, userId) {
        const redis = getRedisClient();
        if (!redis) return;

        const maxLimit = this.#options.maxHistoryLimit;
        const timelineKey = this.#getTimelineKey(platform, userId);
        const hashKey = this.#getHashKey(platform, userId);

        const luaTrimScript = `
            local total = redis.call('ZCARD', KEYS[1])
            local limit = tonumber(ARGV[1])
            if total > limit then
                local removeCount = total - limit
                local expiredFields = redis.call('ZRANGE', KEYS[1], 0, removeCount - 1)
                for _, field in ipairs(expiredFields) do
                    redis.call('HDEL', KEYS[2], field)
                    redis.call('ZREM', KEYS[1], field)
                end
            end
            return 1
        `;

        await redis.eval(luaTrimScript, [timelineKey, hashKey], [String(maxLimit)]);
    }
}

/** 默认导出的全局单例实例 */
export const progressStore = new ProgressStore();

/**
 * 保存播放进度 (快捷入口)
 * @param {MediaProgressPayload} payload
 */
export const saveMediaProgress = (payload) => progressStore.saveProgress(payload);

/**
 * 获取播放进度 (快捷入口)
 * @param {string|number} platform
 * @param {string|number} userId
 * @param {string|number} videoId
 */
export const getMediaProgress = (platform, userId, videoId) => progressStore.getProgress(platform, userId, videoId);

/**
 * 分页查询最近播放列表 (快捷入口)
 * @param {string|number} platform
 * @param {string|number} userId
 * @param {number} [pageNum=1]
 * @param {number} [pageSize=20]
 */
export const getRecentMediaProgressList = (platform, userId, pageNum, pageSize) => progressStore.getRecentList(platform, userId, pageNum, pageSize);

/**
 * 批量删除播放记录 (快捷入口)
 * @param {string|number} platform
 * @param {string|number} userId
 * @param {string|number|Array<string|number>} videoIds
 */
export const deleteMediaProgress = (platform, userId, videoIds) => progressStore.deleteProgress(platform, userId, videoIds);

/**
 * 清空某平台所有播放记录 (快捷入口)
 * @param {string|number} platform
 * @param {string|number} userId
 */
export const clearMediaProgress = (platform, userId) => progressStore.clearPlatformProgress(platform, userId);
