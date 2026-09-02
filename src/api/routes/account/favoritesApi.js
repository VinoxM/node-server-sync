import { defineRoutes } from '#utils/defineUtil.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import { addUserFavorite, filterUserRssFavoritesWithUid, removeUserFavorite } from '#modules/account/service/rssFavoritesService.js';

const { POST } = apiMethodConst;

/** 获取用户收藏模块通信秘钥 */
const needSecret = () => 'mAou5820.userFavorites';

/**
 * 用户 RSS 订阅收藏管理路由模块 (`/favorites/*`)
 */
export default defineRoutes({
    basePath: "/favorites",

    /**
     * 获取当前登录用户的 RSS 订阅收藏 ID 列表
     * 请求体参数：{ subsIds?: Array<number> } (可选筛选列表)
     * 响应：收藏的 RSS 订阅 ID 数组
     */
    '/getUserSubscriptions': {
        method: POST,
        needSecret,
        needAuth: true,
        callback: async (/** @type {ApiRequest} */ req) => {
            const subsIds = req.body['subsIds'];
            const uid = req.userInfo?.id;
            return filterUserRssFavoritesWithUid(uid, subsIds).then(data => Array.from(data).map(d => d.rssSubscribeId));
        }
    },

    /**
     * 添加一条 RSS 订阅收藏
     * 请求体参数：{ rssSubsId: number }
     */
    '/userSubscription/add': {
        method: POST,
        needSecret,
        needAuth: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['rssSubsId']),
        callback: (/** @type {ApiRequest} */ req) => {
            const { rssSubsId } = req.body;
            const uid = req.userInfo?.id;
            if (Number.isInteger(uid) && Number.isInteger(rssSubsId)) {
                return addUserFavorite(uid, rssSubsId);
            }
            __throwMessage('Unsupported parameter type.', -1, 400);
        }
    },

    /**
     * 取消/删除一条 RSS 订阅收藏
     * 请求体参数：{ rssSubsId: number }
     */
    '/userSubscription/del': {
        method: POST,
        needSecret,
        needAuth: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['rssSubsId']),
        callback: (/** @type {ApiRequest} */ req) => {
            const { rssSubsId } = req.body;
            const uid = req.userInfo?.id;
            if (Number.isInteger(uid) && Number.isInteger(rssSubsId)) {
                return removeUserFavorite(uid, rssSubsId);
            }
            __throwMessage('Unsupported parameter type.', -1, 400);
        }
    }
});