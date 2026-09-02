import jwt from 'jsonwebtoken';
import ms from 'ms';
import { generateUUID } from "#utils/cryptoUtil.js";
import { authorizationSyncScript, deleteUserTokensScript } from "#constants/luaScriptsConst.js";
import { GetterContextSubscribe } from "#core/context/subscribe.js";

/**
 * @typedef {import('#types/authorizationTypes.d.ts').UserInfo} UserInfo
 * @typedef {import('#types/authorizationTypes.d.ts').AuthOptionConfig} AuthOptionConfig
 * @typedef {import('#types/authorizationTypes.d.ts').AuthClientConfig} AuthClientConfig
 */

/** @type {GetterContextSubscribe<AuthOptionConfig>} 动态订阅全局授权配置 */
const authOptionsGetter = new GetterContextSubscribe('AuthorizationStoreOption', () => __env.get('auth', {}));

/**
 * 获取指定客户端允许的最大 Token 存储数
 * @param {string} [label=''] - 客户端标识
 * @returns {number}
 */
const userMaxTokenStore = (label = '') => {
    const authOption = authOptionsGetter.getValue();
    const defaultMaxTokenStore = authOption?.maxTokenStore ?? 3;
    if (__isNotBlank(label)) {
        const clientOptions = authOption?.allowedClients ?? [];
        for (const clientOpt of clientOptions) {
            if (label === clientOpt?.id) {
                return clientOpt?.maxTokenStore ?? defaultMaxTokenStore;
            }
        }
    }
    return defaultMaxTokenStore;
};

/**
 * 获取默认 Token 有效期
 * @returns {string|number}
 */
const defaultTokenExpire = () => authOptionsGetter.getValue()?.defaultTokenExpire ?? '30d';

/**
 * 计算 Token 在 Redis 中的 TTL 秒数
 * @returns {number}
 */
const defaultTokenRedisTTL = () => {
    const expire = defaultTokenExpire();
    if (typeof expire === 'number') return expire;

    const milliseconds = ms(expire);
    if (!milliseconds) {
        __log.error(`[TimeError] Invalid expire format: ${expire}`);
        return 2592000;
    }

    return Math.floor(milliseconds / 1000);
};

/**
 * 获取 JWT 签名私钥
 * @returns {string}
 */
const secretKey = () => authOptionsGetter.getValue()?.secretKey ?? __env.get('api.defaultSecret');

/**
 * 根据载荷生成 JWT 凭证
 * @param {UserInfo} payload - 用户信息载荷
 * @param {string|number} [expire] - 过期时间
 * @returns {string} JWT Token 字符串
 */
function generateJWT(payload, expire) {
    return jwt.sign(payload, secretKey(), {
        expiresIn: expire ?? defaultTokenExpire()
    });
}

/**
 * 校验 JWT Token 的合法性与签名
 * @param {string} token - JWT 字符串
 * @returns {boolean}
 */
function verifyJWT(token) {
    try {
        return !!jwt.verify(token, secretKey());
    } catch (ignore) {
        return false;
    }
}

/**
 * 解析并提取 JWT 中的用户载荷
 * @param {string} token - JWT 字符串
 * @returns {UserInfo|null} 用户信息
 */
function decodeJWT(token) {
    try {
        const { iat, exp, ...decode } = jwt.decode(token, secretKey());
        return decode;
    } catch (ignore) {
        return null;
    }
}

/**
 * 内存态 Token 存储管理基类
 * 支持多端并发登录、单端数量上限限制 (LRU 自动淘汰)
 */
export class AuthorizationStore {
    /** @type {Map<number, Map<string, string[]>>} 按 uid -> (clientId -> hash[]) 分类存储的哈希索引 */
    #store = new Map();

    /** @type {Map<string, string>} hash -> raw JWT Token 映射表 */
    #hashStore = new Map();

    constructor() { }

    /**
     * 初始化（子类重写）
     */
    initialize() { }

    /**
     * 活跃度更新并执行淘汰
     * @param {number} uid - 用户 ID
     * @param {string} hash - Token 哈希
     * @param {string} [clientId='default'] - 客户端 ID
     * @param {string} [token] - 原始 JWT
     */
    _touch(uid, hash, clientId = 'default', token) {
        if (!this.#store.has(uid)) {
            this.#store.set(uid, new Map());
        }
        const clientMap = this.#store.get(uid);

        let userTokens = clientMap.get(clientId) || [];
        const idx = userTokens.indexOf(hash);
        if (idx !== -1) {
            userTokens.splice(idx, 1);
        }
        userTokens.push(hash);

        const max = userMaxTokenStore(clientId);
        if (userTokens.length > max) {
            const expiredHash = userTokens.shift();
            this.#hashStore.delete(expiredHash);
        }

        clientMap.set(clientId, userTokens);
        if (token) this.#hashStore.set(hash, token);
    }

    /**
     * 为指定用户载荷生成对应的 Token 凭证与 Hash 句柄
     * @param {UserInfo} payload - 用户信息
     * @param {string|number} [expire] - 有效期
     * @returns {Promise<string>} Token Hash 句柄
     */
    async generateToken(payload, expire) {
        const { id: uid, clientId } = payload;
        const token = generateJWT(payload, expire);
        const hash = generateUUID().replace(/-/g, '');
        this._touch(uid, hash, clientId, token);
        return hash;
    }

    /**
     * 验证 Token Hash 句柄是否合法并回调提取用户信息
     * @param {string} hash - Token Hash
     * @param {(userInfo: UserInfo) => void} [callback] - 成功回调
     * @returns {Promise<boolean>}
     */
    async verifyToken(hash, callback) {
        if (!this.#hashStore.has(hash)) return false;

        const token = this.#hashStore.get(hash);
        if (verifyJWT(token)) {
            const decode = decodeJWT(token);
            if (decode) {
                this._touch(decode.id, hash, decode.clientId);
                if (typeof callback === 'function') callback(decode);
                return true;
            }
        }
        return false;
    }

    /**
     * 删除指定的单个 Token Hash
     * @param {string} hash - Token Hash
     * @returns {Promise<void>}
     */
    async deleteToken(hash) {
        const token = this.#hashStore.get(hash);
        if (token) {
            const decode = decodeJWT(token) || {};
            const { id: uid, clientId } = decode;

            const clientMap = this.#store.get(uid);
            if (clientMap && clientMap.has(clientId)) {
                const tokenArr = clientMap.get(clientId);
                const index = tokenArr.indexOf(hash);
                if (index !== -1) tokenArr.splice(index, 1);
            }
            this.#hashStore.delete(hash);
        }
    }

    /**
     * 删除指定用户下的全部 Token（所有客户端全部下线）
     * @param {number} uid - 用户 ID
     * @returns {Promise<void>}
     */
    async deleteTokenByUid(uid) {
        if (this.#store.has(uid)) {
            const clientMap = this.#store.get(uid);
            for (const hashes of clientMap.values()) {
                hashes.forEach(h => this.#hashStore.delete(h));
            }
            this.#store.delete(uid);
        }
    }

    /**
     * 删除指定用户在特定客户端下的全部 Token
     * @param {number} uid - 用户 ID
     * @param {string} clientId - 客户端 ID
     * @returns {Promise<void>}
     */
    async deleteTokenByClient(uid, clientId) {
        const clientMap = this.#store.get(uid);
        if (clientMap && clientMap.has(clientId)) {
            const hashes = clientMap.get(clientId);
            hashes.forEach(h => this.#hashStore.delete(h));
            clientMap.delete(clientId);
        }
    }

    /**
     * 获取全量内存快照
     * @returns {Array<{ hash: string, token: string, uid: number, clientId: string }>}
     */
    _getSnapshot() {
        return Array.from(this.#hashStore.entries()).map(([hash, token]) => {
            const decode = decodeJWT(token) || {};
            return {
                hash,
                token,
                uid: decode.id,
                clientId: decode.clientId
            };
        });
    }

    /**
     * 获取内部 raw JWT Token
     * @param {string} hash
     * @returns {string|undefined}
     */
    _getInternalToken(hash) {
        return this.#hashStore.get(hash);
    }
}

/**
 * 分布式 Redis + 本地二级缓存 Token 存储管理器
 * 支持 Lua 脚本原子淘汰、心跳健康检查与自动回写同步
 */
export class RedisAuthorizationStore extends AuthorizationStore {
    #redis;
    #isOnline = false;
    #syncing = false;

    #initialized = false;

    constructor() {
        super();
    }

    /**
     * 初始化 Redis 客户端连接与心跳健康检查
     */
    initialize() {
        if (this.#initialized) return;
        this.#redis = __redisClient;
        this.#initialized = true;
        this.#trySync();
        this.#initHeartbeat();
    }

    /**
     * 探测 Redis 连通性并在重新上线时自动将内存数据回写同步至 Redis
     */
    async #trySync() {
        const alive = (await this.#redis.get('ping')).code === 0;
        if (alive && !this.#isOnline) {
            await this.#syncToRedis();
        }
        this.#isOnline = alive;
    }

    /**
     * 启动心跳定时器
     */
    #initHeartbeat() {
        setInterval(() => this.#trySync(), 5000);
    }

    /**
     * 将本地内存快照全量回写同步至 Redis
     */
    async #syncToRedis() {
        if (this.#syncing) return;
        this.#syncing = true;
        __log.info("[AuthorizationStore] Connect to Redis, ready to sync data.");
        try {
            const data = this._getSnapshot();
            for (const item of data) {
                await this.#applyToRedis(item.uid, item.hash, item.token, item.clientId);
            }
        } finally {
            __log.info("[AuthorizationStore] Data synchronization complete.");
            this.#syncing = false;
        }
    }

    /**
     * 通过 Lua 脚本原子写入 Redis 并根据 max 阈值淘汰旧 Token
     * @param {number} uid
     * @param {string} hash
     * @param {string} token
     * @param {string} clientId
     */
    async #applyToRedis(uid, hash, token, clientId) {
        const max = userMaxTokenStore(clientId);
        const redisKey = `user_tokens:${uid}:${clientId}`;
        return await this.#redis.eval(
            authorizationSyncScript,
            [redisKey],
            [Date.now().toString(), hash, max.toString(), token, defaultTokenRedisTTL().toString()]
        );
    }

    /**
     * 生成 Token 并同步至 Redis
     * @param {UserInfo} payload
     * @param {string|number} [expire]
     * @returns {Promise<string>}
     */
    async generateToken(payload, expire) {
        const hash = await super.generateToken(payload, expire);
        const token = this._getInternalToken(hash);
        if (this.#isOnline && token) {
            await this.#applyToRedis(payload.id, hash, token, payload.clientId);
        }
        return hash;
    }

    /**
     * 校验 Token（优先读取本地内存，未命中则从 Redis 回填并更新活跃度）
     * @param {string} hash
     * @param {(userInfo: UserInfo) => void} [callback]
     * @returns {Promise<boolean>}
     */
    async verifyToken(hash, callback) {
        let token = this._getInternalToken(hash);
        if (!token && this.#isOnline) {
            const res = await this.#redis.get(`token:${hash}`);
            if (res.code === 0 && res.data) {
                token = res.data;
                const decode = decodeJWT(token);
                if (decode) {
                    this._touch(decode.id, hash, decode.clientId, token);
                }
            }
        }

        if (token && verifyJWT(token)) {
            const decode = decodeJWT(token);
            if (this.#isOnline && decode) {
                const redisKey = `user_tokens:${decode.id}:${decode.clientId}`;
                this.#redis.zAdd(redisKey, Date.now(), hash).catch(() => { });
            }
            if (typeof callback === 'function' && decode) callback(decode);
            return true;
        }
        return false;
    }

    /**
     * 删除指定 Token 并同步清除 Redis 键
     * @param {string} hash
     * @returns {Promise<void>}
     */
    async deleteToken(hash) {
        const token = this._getInternalToken(hash);
        if (this.#isOnline && token) {
            const decode = decodeJWT(token) || {};
            const uid = decode.id;
            const clientId = decode.clientId;
            await Promise.all([
                this.#redis.zRem(`user_tokens:${uid}:${clientId}`, hash),
                this.#redis.expire(`token:${hash}`, 0)
            ]);
        }
        return super.deleteToken(hash);
    }

    /**
     * 删除指定客户端下的全部 Token
     * @param {number} uid
     * @param {string} clientId
     * @returns {Promise<void>}
     */
    async deleteTokenByClient(uid, clientId) {
        if (this.#isOnline) {
            const redisKey = `user_tokens:${uid}:${clientId}`;
            const res = await this.#redis.zRange(redisKey, 0, -1);
            if (res && res.code === 0 && Array.isArray(res.data)) {
                const deleteTasks = res.data.map(h => this.#redis.expire(`token:${h}`, 0));
                deleteTasks.push(this.#redis.expire(redisKey, 0));
                await Promise.all(deleteTasks);
            }
        }
        return super.deleteTokenByClient(uid, clientId);
    }

    /**
     * 删除用户下的全量 Token（调用 Lua 脚本批量清理）
     * @param {number} uid
     * @returns {Promise<void>}
     */
    async deleteTokenByUid(uid) {
        if (this.#isOnline) {
            try {
                const pattern = `user_tokens:${uid}:*`;

                const res = await this.#redis.eval(
                    deleteUserTokensScript,
                    [pattern],
                    []
                );

                if (res && res.code === 0) {
                    __log.info(`[RedisAuth] Cleaned up all tokens for uid: ${uid}. Keys affected: ${res.data}`);
                }
            } catch (e) {
                __log.error(`[RedisAuth] Lua delete failed for uid ${uid}: ${e.message}`);
            }
        }
        return super.deleteTokenByUid(uid);
    }
}