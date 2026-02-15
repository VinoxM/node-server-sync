import { RedisAuthorizationStore } from "../../instance/authorizationStore.js"
import { AESCrypto } from '../../instance/aesCrypto.js'

const authTokenStore = new RedisAuthorizationStore()

export const initializeAuthTokenStore = () => authTokenStore.initialize()

export const createToken = async (payload, expire) => authTokenStore.generateToken(payload, expire)

export const verifyToken = async (token, callback) => authTokenStore.verifyToken(token, callback)

export const deleteToken = async token => authTokenStore.deleteToken(token)

export const deleteTokenByUid = async uid => authTokenStore.deleteTokenByUid(uid)

export const encryptData = str => AESCrypto.encrypt(str)

export const decryptData = str => AESCrypto.decrypt(str)