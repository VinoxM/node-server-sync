import { decodeAuthorization } from "#modules/authorization/authorizationService.js";
import { defineFilter } from "#utils/defineUtil.js";

/**
 * 用户鉴权过滤器
 * 优先级: -79
 * 作用: 当路由配置了 needAuth 或匹配全局 needAuth 正则时，解析 Header 中的 Bearer Token 并注入 `req.userInfo`
 */
export default defineFilter({
    order: -79,
    doFilter: async (resolve, reject, complete, { req, res, config }) => {
        const { needAuth } = config;
        if (needAuth === undefined || needAuth == null) {
            resolve({ req, res, config });
        }
        const needAuthBooleanFlag = typeof needAuth === 'boolean' && needAuth;
        const needAuthObjectFlag = typeof needAuth === 'object' && __isNotEmptyArray(needAuth.clients);
        if (needAuthBooleanFlag || needAuthObjectFlag) {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            if (needAuthObjectFlag && !needAuth.clients.includes(userInfo.clientId)) {
                __throwMessage('Permission denied.', -401, 401);
            }
            req.userInfo = userInfo;
        }
        resolve({ req, res, config });
    },
});