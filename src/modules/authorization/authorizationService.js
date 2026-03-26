import { RedisAuthorizationStore } from "./authorizationStore.js"
import { aesCrypto } from '../../core/instance/aesCrypto.js'
import { getRequestTokenHash } from "../../common/utils/requestUtil.js"

const authTokenStore = new RedisAuthorizationStore()

export const initializeAuthTokenStore = () => authTokenStore.initialize()

export const createToken = async (payload, expire) => authTokenStore.generateToken(payload, expire)

export const verifyToken = async (token, callback) => authTokenStore.verifyToken(token, callback)

export const deleteToken = async token => authTokenStore.deleteToken(token)

export const deleteTokenByUid = async uid => authTokenStore.deleteTokenByUid(uid)

export const encryptData = str => aesCrypto.encrypt(str)

export const decryptData = str => aesCrypto.decrypt(str)

export const decodeAuthorization = async req => {
    if (req.userInfo) return req.userInfo
    const token = getRequestTokenHash(req)
    try {
        let userInfo = null
        if (__isNotBlank(token) && await verifyToken(token, decode => userInfo = decode)) {
            return userInfo
        }
    } catch (ignored) {
    }
    return null
}