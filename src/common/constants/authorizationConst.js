/**
 * @typedef {Object} SingleAuthConfig
 * @property {Array<string>} clients
 */

/**
 * @typedef {{ [K in keyof typeof NEED_AUTH_CLIENT]: SingleAuthConfig }} NeedAuthSingleClientMap
 */

/**
 * Authorization 授权客户端枚举
 * @readonly
 * @enum {string}
 */
export const NEED_AUTH_CLIENT = {
    ANIME: 'client-anime',
    MANAGE: 'client-manage',
    MEDIA: 'client-media',
    API_POST: 'client-api-post'
}

function generateSingleNeedAuth(client) {
    return { clients: [client] }
}

/**
 * Authorization 授权单客户端枚举定义
 * @readonly
 * @type {NeedAuthSingleClientMap}
 */
export const needAuthSingleClient = Object.fromEntries(Object.keys(NEED_AUTH_CLIENT).map(client => ([client, generateSingleNeedAuth(NEED_AUTH_CLIENT[client])])))