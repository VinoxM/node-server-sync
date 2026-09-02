import { RedisAuthorizationStore } from "./authorizationStore.js";
import { aesCrypto } from "#core/instance/aesCrypto.js";
import { getRequestClientIdAndClientSecret, getRequestTokenHash } from "#utils/requestUtil.js";

/**
 * @typedef {import('#types/authorizationTypes.d.ts').UserInfo} UserInfo
 * @typedef {import('#types/routeTypes.d.ts').ApiRequest} ApiRequest
 * @typedef {import('#types/routeTypes.d.ts').ApiResponse} ApiResponse
 */

/** @type {RedisAuthorizationStore} 全局授权 Token 存储实例 */
const authTokenStore = new RedisAuthorizationStore();

/**
 * 初始化授权 Token 存储器与 Redis 同步机制
 */
export const initializeAuthTokenStore = () => authTokenStore.initialize();

/**
 * 为指定用户信息载荷生成 Token
 * @param {UserInfo} payload - 用户信息
 * @param {string|number} [expire] - 过期时间
 * @returns {Promise<string>} Token Hash 句柄
 */
export const createToken = async (payload, expire) => authTokenStore.generateToken(payload, expire);

/**
 * 校验 Token Hash 的合法性
 * @param {string} token - Token Hash 句柄
 * @param {(userInfo: UserInfo) => void} [callback] - 成功回调
 * @returns {Promise<boolean>}
 */
export const verifyToken = async (token, callback) => authTokenStore.verifyToken(token, callback);

/**
 * 删除指定的 Token Hash（单点注销）
 * @param {string} token - Token Hash 句柄
 * @returns {Promise<void>}
 */
export const deleteToken = async token => authTokenStore.deleteToken(token);

/**
 * 删除指定用户的所有 Token（全平台强制下线）
 * @param {number} uid - 用户 ID
 * @returns {Promise<void>}
 */
export const deleteTokenByUid = async uid => authTokenStore.deleteTokenByUid(uid);

/**
 * 使用 AES 加密敏感字符串（如 Token 密文）
 * @param {string} str - 明文字符串
 * @returns {string} 密文
 */
export const encryptData = str => aesCrypto.encrypt(str);

/**
 * 使用 AES 解密密文字符串
 * @param {string} str - 密文字符串
 * @returns {string} 明文
 */
export const decryptData = str => aesCrypto.decrypt(str);

/**
 * 从 Express 请求中解析并校验用户身份信息
 * @param {ApiRequest} req - HTTP Request
 * @param {boolean} [ignoreError=false] - 当客户端不匹配时是否忽略报错
 * @returns {Promise<UserInfo|null>} 用户载荷对象，校验失败返回 null
 */
export const decodeAuthorization = async (req, ignoreError = false) => {
    if (req.userInfo) return req.userInfo;
    const token = getRequestTokenHash(req);
    try {
        const clientId = verifyClient(req);
        let userInfo = null;
        if (__isNotBlank(token) && await verifyToken(token, decode => {
            if (decode.clientId === clientId) {
                userInfo = decode;
            } else if (!ignoreError) {
                __throwMessage(`Invalid token.`);
            }
        })) {
            return userInfo;
        }
    } catch (ignored) {
    }
    return null;
};

/**
 * 校验请求头中的客户端标识与通信密钥 (ClientId & ClientSecret)
 * @param {ApiRequest} req - HTTP Request
 * @returns {string} 校验合法的 clientId
 * @throws {object} 校验失败抛出错误信息
 */
export const verifyClient = req => {
    const { clientId, clientSecret } = getRequestClientIdAndClientSecret(req);
    __isAnyBlank(clientId, clientSecret) && __throwMessage('Client is blank.');
    const allowedClients = __env.get('auth.allowedClients', []);
    __isEmptyArray(allowedClients) && __throwMessage('Client not configure.');
    for (const client of allowedClients) {
        if (client?.id === clientId && btoa(client?.secret ?? '') === clientSecret) {
            return clientId;
        }
    }
    __throwMessage('Client not supported.');
};