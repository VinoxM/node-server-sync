import jwt from 'jsonwebtoken';
import ms from 'ms';
import { generateUUID } from '../../common/utils/cryptoUtil.js';
import { authorizationSyncScript, deleteUserTokensScript } from '../../common/constants/luaScriptsConst.js';
import { GetterContextSubscribe } from '../../core/context/subscribe.js';

const authOptionsGetter = new GetterContextSubscribe('AuthorizationStoreOption', () => __env.get('auth', {}))

const userMaxTokenStore = (label = '') => {
    const authOption = authOptionsGetter.getValue()
    const defaultMaxTokenStore = authOption?.maxTokenStore ?? 3
    if (__isNotBlank(label)) {
        const clientOptions = authOption?.allowedClients ?? []
        for (const clientOpt of clientOptions) {
            if (label === clientOpt?.id) {
                return clientOpt?.maxTokenStore ?? defaultMaxTokenStore
            }
        }
    }
    return defaultMaxTokenStore
}

const defaultTokenExpire = () => authOptionsGetter.getValue()?.defaultTokenExpire ?? '30d'

const defaultTokenRedisTTL = () => {
    const expire = defaultTokenExpire()
    if (typeof expire === 'number') return expire;

    const milliseconds = ms(expire);
    if (!milliseconds) {
        __log.error(`[TimeError] Invalid expire format: ${expire}`);
        return 2592000;
    }

    return Math.floor(milliseconds / 1000);
}

const secretKey = () => authOptionsGetter.getValue()?.secretKey ?? __env.get('api.defaultSecret')

function generateJWT(payload, expire) {
    return jwt.sign(payload, secretKey(), {
        expiresIn: expire ?? defaultTokenExpire()
    })
}

function verifyJWT(token) {
    try {
        return !!jwt.verify(token, secretKey())
    } catch (ignore) {
        return false
    }
}

function decodeJWT(token) {
    try {
        const { iat, exp, ...decode } = jwt.decode(token, secretKey())
        return decode
    } catch (ignore) {
        return null
    }
}

export class AuthorizationStore {
    #store = new Map();     // Map<uid, Map<clientId, Array<hash>>>
    #hashStore = new Map(); // Map<hash, token>

    constructor() { }

    initialize() { }

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

    async generateToken(payload, expire) {
        const { id: uid, clientId } = payload;
        const token = generateJWT(payload, expire);
        const hash = generateUUID().replace(/-/g, '');
        this._touch(uid, hash, clientId, token);
        return hash;
    }

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

    async deleteTokenByUid(uid) {
        if (this.#store.has(uid)) {
            const clientMap = this.#store.get(uid);
            for (const hashes of clientMap.values()) {
                hashes.forEach(h => this.#hashStore.delete(h));
            }
            this.#store.delete(uid);
        }
    }

    async deleteTokenByClient(uid, clientId) {
        const clientMap = this.#store.get(uid);
        if (clientMap && clientMap.has(clientId)) {
            const hashes = clientMap.get(clientId);
            hashes.forEach(h => this.#hashStore.delete(h));
            clientMap.delete(clientId);
        }
    }

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

    _getInternalToken(hash) {
        return this.#hashStore.get(hash);
    }
}

export class RedisAuthorizationStore extends AuthorizationStore {
    #redis;
    #isOnline = false;
    #syncing = false;

    #initialized = false;

    constructor() {
        super();
    }

    initialize() {
        if (this.#initialized) return;
        this.#redis = __redisClient;
        this.#initialized = true;
        this.#trySync();
        this.#initHeartbeat();
    }

    async #trySync() {
        const alive = (await this.#redis.get('ping')).code === 0;
        if (alive && !this.#isOnline) {
            await this.#syncToRedis();
        }
        this.#isOnline = alive;
    }

    #initHeartbeat() {
        setInterval(() => this.#trySync(), 5000);
    }

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

    async #applyToRedis(uid, hash, token, clientId) {
        const max = userMaxTokenStore(clientId);
        const redisKey = `user_tokens:${uid}:${clientId}`;
        return await this.#redis.eval(
            authorizationSyncScript,
            [redisKey],
            [Date.now().toString(), hash, max.toString(), token, defaultTokenRedisTTL().toString()]
        );
    }

    async generateToken(payload, expire) {
        const hash = await super.generateToken(payload, expire);
        const token = this._getInternalToken(hash);
        if (this.#isOnline) {
            await this.#applyToRedis(payload.id, hash, token, payload.clientId);
        }
        return hash;
    }

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
            if (this.#isOnline) {
                const redisKey = `user_tokens:${decode.id}:${decode.clientId}`;
                this.#redis.zAdd(redisKey, Date.now(), hash).catch(() => { });
            }
            if (typeof callback === 'function') callback(decode);
            return true;
        }
        return false;
    }

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