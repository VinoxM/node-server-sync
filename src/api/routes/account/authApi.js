import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import { decryptionBodyKeys } from '#utils/preHandleUtil.js';
import { getRequestTokenHash } from '#utils/requestUtil.js';
import { registerAccount, resetPassword, userLogin, userLogout } from '#modules/account/service/accountService.js';
import { decodeAuthorization, verifyClient } from '#modules/authorization/authorizationService.js';

const { POST } = apiMethodConst;

/** 获取鉴权模块通信秘钥 */
const needSecret = () => 'mAou5820.authorization';

/**
 * 用户账户与身份认证路由模块 (`/auth/*`)
 */
export default defineRoutes({
    basePath: "/auth",

    /**
     * 用户注册接口
     * 请求体参数：{ uname: string, password: string(AES加密密文) }
     */
    "/register": {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password']),
        preHandle: req => decryptionBodyKeys(req, ['password']),
        callback: async (/** @type {ApiRequest} */ req) => registerAccount(req.body.uname, req.body.password)
    },

    /**
     * 用户修改/重置密码接口
     * 请求体参数：{ uname: string, password: string(原密码密文), newPassword: string(新密码密文) }
     */
    '/resetPassword': {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password', 'newPassword']),
        preHandle: req => decryptionBodyKeys(req, ['password', 'newPassword']),
        callback: async (/** @type {ApiRequest} */ req) => resetPassword(req.body.uname, req.body.password, req.body.newPassword)
    },

    /**
     * 用户登录认证接口
     * 请求体参数：{ uname: string, password: string(AES加密密文) }
     * 响应：AES 加密后的 Token 凭证密文
     */
    '/login': {
        method: POST,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['uname', 'password']),
        preHandle: req => decryptionBodyKeys(req, ['password']),
        callback: async (/** @type {ApiRequest} */ req) => {
            const clientId = verifyClient(req);
            return userLogin(req.body.uname, req.body.password, clientId);
        }
    },

    /**
     * 用户注销/退出登录接口（销毁当前 Token）
     */
    '/logout': {
        method: POST,
        needSecret,
        needAuth: true,
        callback: (/** @type {ApiRequest} */ req) => {
            const hash = getRequestTokenHash(req);
            return userLogout(hash);
        }
    },

    /**
     * 校验当前 Token 登录有效性接口
     * 响应：当前登录用户的 uname
     */
    '/checkAuth': {
        method: POST,
        needSecret,
        needAuth: true,
        callback: (/** @type {ApiRequest} */ req) => decodeAuthorization(req).then(userInfo => userInfo?.uname)
    }
});