import jwt from 'jsonwebtoken';
import { generateUUID } from '../common/stringUtil.js';

const userMaxTokenStore = () => __env.get('auth.maxTokenStore', 3)

const defaultTokenExpire = () => __env.get('auth.defaultTokenExpire', '30m')

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
    #store = new Map()
    #hashStore = new Map()
    constructor() { }

    generateToken(payload, expire) {
        const { id } = payload
        const token = generateJWT(payload, expire)
        let userTokens = []
        if (this.#store.has(id)) {
            userTokens = Array.from(this.#store.get(id))
        }
        const hash = generateUUID().replace('-', '')
        userTokens.push(hash)
        const max = userMaxTokenStore()
        const diff = userTokens.length - max
        if (diff > 0) {
            userTokens.splice(0, diff).forEach(h => this.#hashStore.delete(h))
        }
        this.#hashStore.set(hash, token)
        this.#store.set(id, userTokens)
        return hash
    }

    verifyToken(hash, callback) {
        let flag = false
        let decode = {}
        if (this.#hashStore.has(hash)) {
            const token = this.#hashStore.get(hash)
            if (verifyJWT(token)) {
                decode = decodeJWT(token)
                if (Array.from(this.#store.get(decode.id)).includes(hash)) {
                    flag = true
                }
            }
        }
        if (flag && isFunction(callback)) {
            callback(decode)
        }
        return flag
    }

    deleteToken(hash) {
        if (this.#hashStore.has(hash)) {
            const token = this.#hashStore.get(hash)
            const decode = decodeJWT(token) ?? {}
            const { id = -1 } = decode
            const tokenArr = Array.from(this.#store[id] ?? [])
            if (tokenArr.includes(token)) {
                const index = tokenArr.indexOf(token)
                tokenArr.splice(index, 1)
            }
            this.#hashStore.delete(hash)
        }
    }

    deleteTokenByUid(uid) {
        if (this.#store.has(uid)) {
            const userTokens = Array.from(this.#store.get(uid))
            userTokens.forEach(h => this.#hashStore.delete(h))
            this.#store.delete(uid)
        }
    }
}