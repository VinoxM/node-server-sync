import { AuthorizationStore } from "../../instance/authorizationStore.js"
import { AESCrypto } from '../../instance/aesCrypto.js'

const authTokenStore = new AuthorizationStore()

export const createToken = (payload, expire) => authTokenStore.generateToken(payload, expire)

export const verifyToken = (token, callback) => authTokenStore.verifyToken(token, callback)

export const deleteToken = token => authTokenStore.deleteToken(token)

export const deleteTokenByUid = uid => authTokenStore.deleteTokenByUid(uid)

export const encryptData = str => AESCrypto.encrypt(str)

export const decryptData = str => AESCrypto.decrypt(str)