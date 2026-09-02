import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeysNotBlank, checkBodyKeysExists } from '#utils/preCheckUtil.js';
import { kuroGameSign, kuroTokenLogin, kuroLogout, kuroGameSignAll, kuroSignGameUpdate, kuroSDKLogin } from '#modules/kuro/service/kuroService.js';

const { POST } = apiMethodConst;

/** 获取库洛游戏路由通信秘钥 */
const needSecret = () => "mAou5820.kuro";

/**
 * 库洛游戏 (Kuro Game) 社区与自动签到路由模块 (`/kuro/*`)
 */
export default defineRoutes({
    basePath: "/kuro",

    /**
     * 手机短信验证码 SDK 登录
     * 请求体参数：{ uid: string|number, mobile: string, code: string }
     */
    '/sdkLogin': {
        method: POST,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['code', 'uid', 'mobile']),
        callback: (/** @type {ApiRequest} */ req) => {
            return kuroSDKLogin(req.body);
        }
    },

    /**
     * 库洛 Token 免密登录绑定
     * 请求体参数：{ token: string, signGames?: string }
     */
    '/tokenLogin': {
        method: POST,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'token'),
        callback: (/** @type {ApiRequest} */ req) => {
            return kuroTokenLogin(req.body.token, req.body.signGames);
        }
    },

    /**
     * 退出登录并删除存储凭证
     * 请求体参数：{ uid: string|number }
     */
    '/logout': {
        method: POST,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'uid'),
        callback: (/** @type {ApiRequest} */ req) => {
            return kuroLogout(req.body.uid);
        }
    },

    /**
     * 更新指定用户的自动签到游戏配置
     * 请求体参数：{ uid: string|number, signGames: string }
     */
    '/updateSignGame': {
        method: POST,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeyNotBlank(req, 'uid') && checkBodyKeysExists(req, ['signGames']),
        callback: (/** @type {ApiRequest} */ req) => {
            return kuroSignGameUpdate(req.body.uid, req.body.signGames);
        }
    },

    /**
     * 单用户单游戏手动触发签到
     * 请求体参数：{ uid: string|number, gameId: number|string }
     */
    '/gameSign': {
        method: POST,
        needSecret,
        preCheck: (/** @type {ApiRequest} */ req) => checkBodyKeysNotBlank(req, ['uid', 'gameId']),
        callback: (/** @type {ApiRequest} */ req) => {
            return kuroGameSign(req.body.uid, null, req.body.gameId);
        }
    },

    /**
     * 全员全游戏批量自动签到
     */
    '/gameSignAll': {
        method: POST,
        needSecret,
        callback: () => {
            return kuroGameSignAll();
        }
    }
});