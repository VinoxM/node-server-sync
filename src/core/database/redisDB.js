import redis from 'redis';

/**
 * @template T
 * @typedef {Object} RedisResult
 * @property {number} code - 响应状态码 (0: 成功, -1: 操作失败, -2: 客户端未就绪/熔断开启)
 * @property {string} msg - 状态描述消息
 * @property {T} [data] - 返回的业务数据
 */

const Result = {
    success: (message) => ({ code: 0, msg: message || 'Success' }),
    data: (data, message) => ({ code: 0, msg: message || 'Success', data }),
    failed: (reason) => ({ code: -1, msg: reason || 'Failed' }),
    invalidKey: () => Result.failed('Invalid key'),
    notReady: () => ({ code: -2, msg: 'Client not ready' })
};

/**
 * 校验 Redis 键名是否合法（非空字符串或非空字符串数组）
 * @param {string|string[]} key - 键名或键名数组
 * @returns {boolean} 是否合法
 */
function checkKeys(key) {
    if (Array.isArray(key)) {
        return key.every(k => k && typeof k === 'string' && k.trim() !== '');
    } else {
        return key && typeof key === 'string' && key.trim() !== '';
    }
}

/**
 * 校验过期时间是否为合法的正整数
 * @param {number} expire - 过期秒数
 * @returns {boolean} 是否合法
 */
function checkExpire(expire) {
    return Number.isInteger(expire) && expire > 0;
}

/**
 * Redis 客户端封装类
 * 内置断线重连、熔断降级（Circuit Breaker）机制及常用命令的统一封装
 */
export class RedisClient {
    /** @type {string|undefined} */
    #url;
    /** @type {import('redis').RedisClientType|undefined} */
    #client;
    #ready = false;
    #isTesting = false;
    /** @type {'CLOSED'|'OPEN'|'HALF_OPEN'} 熔断器状态 */
    #cbStatus = 'CLOSED';
    #failureCount = 0;
    /** @type {number} 连续失败熔断阈值 */
    #failureThreshold;
    /** @type {number} 熔断恢复探测等待时间 (秒) */
    #recoveryTimeout;

    /**
     * @param {Object} [redisOptions={}] - Redis 连接配置
     * @param {string} [redisOptions.host] - Redis 服务器主机名/IP
     * @param {number} [redisOptions.port=6379] - 端口号
     * @param {number} [redisOptions.database=1] - 数据库索引 (0~15)
     * @param {string} [redisOptions.username='default'] - 用户名
     * @param {string} [redisOptions.password=''] - 密码
     * @param {number} [redisOptions.failureThreshold=5] - 触发熔断的连续失败次数阈值
     * @param {number} [redisOptions.recoveryTimeout=30] - 熔断后进入半开状态尝试恢复的等待时间 (秒)
     */
    constructor(redisOptions = {}) {
        const { host, port = 6379, database = 1, username = 'default', password = '', failureThreshold = 5, recoveryTimeout = 30 } = redisOptions;
        this.#failureThreshold = failureThreshold;
        this.#recoveryTimeout = recoveryTimeout;
        this.#url = `redis://${username}:${password}@${host}:${port}/${database}`;
        __log.info(`[Redis] Used database: ${database}.`);
    }

    /**
     * 初始化 Redis 客户端连接并绑定事件监听器
     */
    initialization() {
        this.#client = redis.createClient({
            url: this.#url,
            socket: {
                reconnectStrategy: (retries) => Math.min(retries * 500, 5000)
            },
            disableOfflineQueue: true
        });

        this.#client.on('ready', () => {
            this.#ready = true;
            this.#onSuccess();
        });

        this.#client.on('error', (err) => {
            this.#ready = false;
            this.#onFailure();
        });

        this.#client.connect().catch(() => this.#onFailure());
    }

    /**
     * 操作成功回调，重置失败计数与熔断状态
     */
    #onSuccess() {
        this.#failureCount = 0;
        this.#cbStatus = 'CLOSED';
        this.#isTesting = false;
    }

    /**
     * 操作失败回调，累计失败次数并在达到阈值时触发熔断
     */
    #onFailure() {
        this.#isTesting = false;
        this.#failureCount++;
        if (this.#failureCount >= this.#failureThreshold) {
            this.#openCircuit();
        }
    }

    /**
     * 开启熔断器，并在超时后转入半开 (HALF_OPEN) 探测状态
     */
    #openCircuit() {
        if (this.#cbStatus === 'OPEN') return;
        this.#cbStatus = 'OPEN';
        __log.error(`[Redis] The circuit breaker is on! Redis access will be skipped and fallback to local storage.`);

        setTimeout(() => {
            this.#cbStatus = 'HALF_OPEN';
            __log.info(`[Redis] The circuit breaker goes into a half-open state, trying to detect the connection...`);
        }, this.#recoveryTimeout * 1000).unref();
    }

    /**
     * 判断当前熔断状态与连接状态是否允许访问 Redis
     * @returns {Promise<boolean>} 是否允许执行
     */
    async #shouldAccess() {
        if (this.#cbStatus === 'OPEN') return false;
        if (this.#cbStatus === 'HALF_OPEN') {
            if (this.#isTesting) return false;
            this.#isTesting = true;
            return true;
        }
        return this.#ready;
    }

    /**
     * 尝试安全执行异步 Redis 操作任务（包装熔断检查与异常处理）
     * @template T
     * @param {() => Promise<T>} asyncTask - 待执行的操作函数
     * @returns {Promise<RedisResult<T>>}
     */
    async #tryExecute(asyncTask) {
        const access = await this.#shouldAccess();
        if (!access) {
            return Result.notReady();
        }
        try {
            const res = await asyncTask();
            this.#onSuccess();
            return Result.data(res);
        } catch (err) {
            __log.error(`[Redis] Operation Error: ${err.message}`);
            this.#onFailure();
            return Result.failed(err.message);
        }
    }

    /**
     * 校验键名合法性并执行异步操作
     * @template T
     * @param {string|string[]} keys - 待校验的键名
     * @param {() => Promise<T>} asyncTask - 待执行的操作函数
     * @returns {Promise<RedisResult<T>>}
     */
    async #tryCheckKeyAndExecute(keys, asyncTask) {
        return checkKeys(keys) ?
            this.#tryExecute(asyncTask) :
            Result.invalidKey();
    }

    /**
     * 设置键的过期时间
     * @param {string} key - 键名
     * @param {number} expire - 过期时间 (秒)
     * @returns {Promise<RedisResult<boolean>>} 是否成功设置过期时间
     */
    async expire(key, expire) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.expire(key, expire));
    }

    /**
     * 获取指定 String 键的值
     * @param {string} key - 键名
     * @returns {Promise<RedisResult<string|null>>} 键对应的值，若不存在则为 null
     */
    async get(key) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.get(key));
    }

    /**
     * 设置指定 String 键的值（支持设置过期时间）
     * @param {string} key - 键名
     * @param {string|number} value - 待设置的值
     * @param {number} [expire] - 可选的过期时间 (秒)
     * @returns {Promise<RedisResult<string|null>>} 执行结果 (如 'OK')
     */
    async set(key, value, expire) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.set(key, value, { ...(checkExpire(expire) && { EX: expire }) }));
    }

    /**
     * 仅当键不存在时设置值 (SET NX)，支持设置过期时间
     * @param {string} key - 键名
     * @param {string|number} value - 待设置的值
     * @param {number} [expire] - 可选的过期时间 (秒)
     * @returns {Promise<RedisResult<string|null>>} 设置成功返回 'OK'，键已存在则返回 null
     */
    async setIfAbsent(key, value, expire) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.set(key, value, { NX: true, ...(checkExpire(expire) && { EX: expire }) }));
    }

    /**
     * 获取 Hash 哈希表中指定字段的值
     * @param {string} key - 哈希表键名
     * @param {string} hashKey - 哈希字段名
     * @returns {Promise<RedisResult<string|undefined>>} 字段值
     */
    async hGet(key, hashKey) {
        return this.#tryCheckKeyAndExecute([key, hashKey], () => this.#client.hGet(key, hashKey));
    }

    /**
     * 设置 Hash 哈希表中指定字段的值
     * @param {string} key - 哈希表键名
     * @param {string} hashKey - 哈希字段名
     * @param {string|number} value - 字段值
     * @returns {Promise<RedisResult<number>>} 成功添加新字段返回 1，覆盖已有字段返回 0
     */
    async hSet(key, hashKey, value) {
        return this.#tryCheckKeyAndExecute([key, hashKey], () => this.#client.hSet(key, hashKey, value));
    }

    /**
     * 判断 Hash 哈希表中指定字段是否存在
     * @param {string} key - 哈希表键名
     * @param {string} hashKey - 哈希字段名
     * @returns {Promise<RedisResult<boolean>>} 字段是否存在
     */
    async hExists(key, hashKey) {
        return this.#tryCheckKeyAndExecute([key, hashKey], () => this.#client.hExists(key, hashKey));
    }

    /**
     * 执行 Lua 脚本 (原子操作)
     * @template T
     * @param {string} script - Lua 脚本内容
     * @param {string[]} [keys=[]] - KEYS 参数键名数组
     * @param {string[]} [args=[]] - ARGV 参数数组
     * @returns {Promise<RedisResult<T>>} Lua 脚本执行返回值
     */
    async eval(script, keys = [], args = []) {
        return this.#tryExecute(() => this.#client.eval(script, {
            keys: keys,
            arguments: args
        }));
    }

    /**
     * 有序集合 (ZSet): 添加成员
     * @param {string} key - ZSet 键名
     * @param {number} score - 分数
     * @param {string} value - 成员值
     * @returns {Promise<RedisResult<number>>} 新添加成功的成员数量
     */
    async zAdd(key, score, value) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.zAdd(key, { score, value }));
    }

    /**
     * 有序集合 (ZSet): 按索引范围获取成员列表 (默认按分数升序)
     * @param {string} key - ZSet 键名
     * @param {number} [start=0] - 起始索引 (包含)
     * @param {number} [stop=-1] - 结束索引 (包含，-1 表示最后一个元素)
     * @returns {Promise<RedisResult<string[]>>} 范围内的成员数组
     */
    async zRange(key, start = 0, stop = -1) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.zRange(key, start, stop));
    }

    /**
     * 有序集合 (ZSet): 移除指定成员
     * @param {string} key - ZSet 键名
     * @param {string|string[]} value - 待移除的成员值（单个或数组）
     * @returns {Promise<RedisResult<number>>} 成功移除的成员数量
     */
    async zRem(key, value) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.zRem(key, value));
    }

    /**
     * 有序集合 (ZSet): 获取集合中的成员总数
     * @param {string} key - ZSet 键名
     * @returns {Promise<RedisResult<number>>} 集合基数 (成员数量)
     */
    async zCard(key) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.zCard(key));
    }
}