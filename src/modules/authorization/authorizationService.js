import { RedisAuthorizationStore } from "./authorizationStore.js"
import { aesCrypto } from '../../core/instance/aesCrypto.js'
import { getRequestClientIdAndClientSecret, getRequestTokenHash } from "../../common/utils/requestUtil.js"

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
        const clientId = verifyClient(req)
        let userInfo = null
        if (__isNotBlank(token) && await verifyToken(token, decode => {
            if (decode.clientId === clientId) {
                userInfo = decode
            } else {
                __throwMessage(`Invalid token.`)
            }
        })) {
            return userInfo
        }
    } catch (ignored) {
    }
    return null
}

export const verifyClient = req => {
    const { clientId, clientSecret } = getRequestClientIdAndClientSecret(req)
    __isAnyBlank(clientId, clientSecret) && __throwMessage('Client is blank.')
    const allowedClients = __env.get('auth.allowedClients', [])
    __isEmptyArray(allowedClients) && __throwMessage('Client not configure.')
    for (const client of allowedClients) {
        if (client?.id === clientId && btoa(client?.secret ?? '') === clientSecret) {
            return clientId
        }
    }
    __throwMessage('Client not supported.')
}