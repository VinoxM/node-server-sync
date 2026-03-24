import { RedisAuthorizationStore } from "../../instance/authorizationStore.js"
import { AESCrypto } from '../../instance/aesCrypto.js'
import { getTokenHash } from "../../common/httpUtil.js"

const authTokenStore = new RedisAuthorizationStore()

export const initializeAuthTokenStore = () => authTokenStore.initialize()

export const createToken = async (payload, expire) => authTokenStore.generateToken(payload, expire)

export const verifyToken = async (token, callback) => authTokenStore.verifyToken(token, callback)

export const deleteToken = async token => authTokenStore.deleteToken(token)

export const deleteTokenByUid = async uid => authTokenStore.deleteTokenByUid(uid)

export const encryptData = str => AESCrypto.encrypt(str)

export const decryptData = str => AESCrypto.decrypt(str)

export const decodeAuthorization = async req => {
    if (req.userInfo) return req.userInfo
    const token = getTokenHash(req)
    try {
        let userInfo = null
        if (isNotBlank(token) && await verifyToken(token, decode => userInfo = decode)) {
            return userInfo
        }
    } catch (ignored) {
    }
    return null
}