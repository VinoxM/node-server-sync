import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { decodeAuthorization } from "#modules/authorization/authorizationService.js";
import { defineFilter } from "#utils/defineUtil.js";

/** 全局配置中需强制鉴权的 API 正则订阅 */
const needAuthApiRegex = new GetterContextSubscribe('NeedAuthApi', () => __env.get('api.needAuth', []).map(r => new RegExp(r)));

/**
 * 用户鉴权过滤器
 * 优先级: -79
 * 作用: 当路由配置了 needAuth 或匹配全局 needAuth 正则时，解析 Header 中的 Bearer Token 并注入 `req.userInfo`
 */
export default defineFilter({
    order: -79,
    doFilter: async (resolve, reject, complete, { req, res, config }) => {
        const { needAuth } = config;
        if (needAuth || needAuthApiRegex.getValue().some(r => r.test(req.path))) {
            const userInfo = await decodeAuthorization(req);
            userInfo || __throwMessage('Permission denied.', -401, 401);
            req.userInfo = userInfo;
        }
        resolve({ req, res, config });
    },
});