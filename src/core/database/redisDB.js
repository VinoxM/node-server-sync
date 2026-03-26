import redis from 'redis'

const Result = {
    success: (message) => ({ code: 0, msg: message || 'Success' }),
    data: (data, message) => ({ code: 0, msg: message || 'Success', data }),
    failed: (reason) => ({ code: -1, msg: reason || 'Failed' }),
    invalidKey: () => Result.failed('Invalid key'),
    notReady: () => ({ code: -2, msg: 'Client not ready' })
}

function checkKeys(key) {
    if (Array.isArray(key)) {
        return key.every(k => k && typeof k === 'string' && k.trim() !== '')
    } else {
        return key && typeof key === 'string' && key.trim() !== ''
    }
}

function checkExpire(expire) {
    return Number.isInteger(expire) && expire > 0
}

export class RedisClient {

    #url
    #client;
    #ready = false;
    #isTesting = false;

    #cbStatus = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    #failureCount = 0;
    #failureThreshold;
    #recoveryTimeout;

    constructor(redisOptions = {}) {
        const { host, port = 6379, database = 1, username = 'default', password = '', failureThreshold = 5, recoveryTimeout = 30 } = redisOptions
        this.#failureThreshold = failureThreshold
        this.#recoveryTimeout = recoveryTimeout
        this.#url = `redis://${username}:${password}@${host}:${port}/${database}`
        __log.info(`[Redis] Used database: ${database}.`)
    }

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

    #onSuccess() {
        this.#failureCount = 0;
        this.#cbStatus = 'CLOSED';
        this.#isTesting = false;
    }

    #onFailure() {
        this.#isTesting = false;
        this.#failureCount++;
        if (this.#failureCount >= this.#failureThreshold) {
            this.#openCircuit();
        }
    }

    #openCircuit() {
        if (this.#cbStatus === 'OPEN') return;
        this.#cbStatus = 'OPEN';
        __log.error(`[Redis] The circuit breaker is on! Redis access will be skipped and fallback to local storage.`);

        setTimeout(() => {
            this.#cbStatus = 'HALF_OPEN';
            __log.info(`[Redis] The circuit breaker goes into a half-open state, trying to detect the connection...`);
        }, this.#recoveryTimeout * 1000).unref();
    }

    async #shouldAccess() {
        if (this.#cbStatus === 'OPEN') return false;
        if (this.#cbStatus === 'HALF_OPEN') {
            if (this.#isTesting) return false;
            this.#isTesting = true;
            return true;
        }
        return this.#ready;
    }

    async #tryExecute(asyncTask) {
        const access = await this.#shouldAccess()
        if (!access) {
            return Result.notReady();
        }
        try {
            const res = await asyncTask()
            this.#onSuccess();
            return Result.data(res);
        } catch (err) {
            __log.error(`[Redis] Operation Error: ${err.message}`);
            this.#onFailure();
            return Result.failed(err.message);
        }
    }

    async #tryCheckKeyAndExecute(keys, asyncTask) {
        return checkKeys(keys) ?
            this.#tryExecute(asyncTask) :
            Result.invalidKey()
    }

    async expire(key, expire) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.expire(key, expire))
    }

    async get(key) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.get(key))
    }

    async set(key, value, expire) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.set(key, value, { ...(checkExpire(expire) && { EX: expire }) }))
    }

    async setIfAbsent(key, value, expire) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.set(key, value, { NX: true, ...(checkExpire(expire) && { EX: expire }) }))
    }

    async hGet(key, hashKey) {
        return this.#tryCheckKeyAndExecute([key, hashKey], () => this.#client.hGet(key, hashKey))
    }

    async hSet(key, hashKey, value) {
        return this.#tryCheckKeyAndExecute([key, hashKey], () => this.#client.hSet(key, hashKey, value))
    }

    async hExists(key, hashKey) {
        return this.#tryCheckKeyAndExecute([key, hashKey], () => this.#client.hExists(key, hashKey))
    }

    /**
     * 执行 Lua 脚本 (原子操作)
     * @param {string} script Lua 脚本内容
     * @param {string[]} keys 键名数组
     * @param {string[]} args 参数数组
     */
    async eval(script, keys = [], args = []) {
        return this.#tryExecute(() => this.#client.eval(script, {
            keys: keys,
            arguments: args
        }))
    }

    /**
     * ZSet: 添加成员
     * @param {string} key 
     * @param {number} score 分数
     * @param {string} value 成员值
     */
    async zAdd(key, score, value) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.zAdd(key, { score, value }))
    }

    /**
     * ZSet: 获取范围内的成员 (默认按分数升序)
     * @param {string} key
     * @param {number} start 索引开始
     * @param {number} stop 索引结束
     */
    async zRange(key, start = 0, stop = -1) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.zRange(key, start, stop))
    }

    /**
     * ZSet: 移除成员
     */
    async zRem(key, value) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.zRem(key, value))
    }

    /**
     * ZSet: 获取集合大小
     */
    async zCard(key) {
        return this.#tryCheckKeyAndExecute(key, () => this.#client.zCard(key))
    }
}