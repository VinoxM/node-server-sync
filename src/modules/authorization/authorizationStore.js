import jwt from 'jsonwebtoken';
import ms from 'ms';
import { generateUUID } from '../../common/utils/cryptoUtil.js';
import { authorizationSyncScript } from '../../common/constants/luaScriptsConst.js';

const userMaxTokenStore = () => __env.get('auth.maxTokenStore', 3)

const defaultTokenExpire = () => __env.get('auth.defaultTokenExpire', '30d')

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

const secretKey = () => __env.get('auth.secretKey') ?? __env.get('api.defaultSecret')

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
    #store = new Map();     // Map<uid, Array<hash>>
    #hashStore = new Map(); // Map<hash, token>

    constructor() { }

    initialize() { }

    _touch(uid, hash, token) {
        let userTokens = this.#store.get(uid) || [];
        const idx = userTokens.indexOf(hash);
        if (idx !== -1) {
            userTokens.splice(idx, 1);
        }
        userTokens.push(hash);

        const max = userMaxTokenStore();
        if (userTokens.length > max) {
            const expiredHash = userTokens.shift();
            this.#hashStore.delete(expiredHash);
        }
        this.#store.set(uid, userTokens);
        token && this.#hashStore.set(hash, token);
    }

    async generateToken(payload, expire) {
        const { id: uid } = payload;
        const token = generateJWT(payload, expire);
        const hash = generateUUID().replace(/-/g, '');
        this._touch(uid, hash, token);
        return hash;
    }

    async verifyToken(hash, callback) {
        if (!this.#hashStore.has(hash)) return false;

        const token = this.#hashStore.get(hash);
        if (verifyJWT(token)) {
            const decode = decodeJWT(token);
            this._touch(decode.id, hash);
            if (typeof callback === 'function') callback(decode);
            return true;
        }
        return false;
    }

    async deleteToken(hash) {
        if (this.#hashStore.has(hash)) {
            const token = this.#hashStore.get(hash)
            const decode = decodeJWT(token) ?? {}
            const { id = -1 } = decode
            const tokenArr = Array.from(this.#store.get(id) ?? [])
            if (tokenArr.includes(token)) {
                const index = tokenArr.indexOf(token)
                tokenArr.splice(index, 1)
            }
            this.#hashStore.delete(hash)
        }
    }

    async deleteTokenByUid(uid) {
        if (this.#store.has(uid)) {
            const userTokens = Array.from(this.#store.get(uid))
            userTokens.forEach(h => this.#hashStore.delete(h))
            this.#store.delete(uid)
        }
    }

    _getSnapshot() {
        return Array.from(this.#hashStore.entries()).map(([hash, token]) => ({
            hash,
            token,
            uid: (decodeJWT(token) || {}).id
        }));
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
        if (this.#initialized) return
        this.#redis = __redisClient;
        this.#initialized = true
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
                await this.#applyToRedis(item.uid, item.hash, item.token);
            }
        } finally {
            __log.info("[AuthorizationStore] Data synchronization complete.");
            this.#syncing = false;
        }
    }

    async #applyToRedis(uid, hash, token) {
        const max = userMaxTokenStore();
        return await this.#redis.eval(
            authorizationSyncScript,
            [`user_tokens:${uid}`],
            [Date.now().toString(), hash, max.toString(), token, defaultTokenRedisTTL().toString()]
        );
    }

    async generateToken(payload, expire) {
        const hash = await super.generateToken(payload, expire);
        const token = this._getInternalToken(hash);
        if (this.#isOnline) {
            await this.#applyToRedis(payload.id, hash, token);
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
                    this._touch(decode.id, hash, token);
                }
            }
        }
        if (token && verifyJWT(token)) {
            const decode = decodeJWT(token);
            if (this.#isOnline) {
                this.#redis.zAdd(`user_tokens:${decode.id}`, Date.now(), hash).catch(() => { });
            }
            if (typeof callback === 'function') callback(decode);
            return true;
        }
        return false;
    }

    async deleteToken(hash) {
        const token = this._getInternalToken(hash);
        let uid = -1;
        if (token) {
            const decode = decodeJWT(token) ?? {};
            uid = decode.id ?? -1;
        }
        if (this.#isOnline && uid !== -1) {
            await Promise.all([
                this.#redis.zRem(`user_tokens:${uid}`, hash),
                this.#redis.expire(`token:${hash}`, 0)
            ]);
        }
        return super.deleteToken(hash);
    }

    async deleteTokenByUid(uid) {
        if (this.#isOnline) {
            try {
                const res = await this.#redis.zRange(`user_tokens:${uid}`, 0, -1);
                if (res.code === 0 && Array.isArray(res.data)) {
                    const hashes = res.data;
                    const deleteTasks = hashes.map(h => this.#redis.expire(`token:${h}`, 0));
                    deleteTasks.push(this.#redis.expire(`user_tokens:${uid}`, 0));
                    await Promise.all(deleteTasks);
                }
            } catch (e) {
                __log.error(`[RedisAuth] Delete user tokens failed: ${e.message}`);
            }
        }
        return super.deleteTokenByUid(uid);
    }
}