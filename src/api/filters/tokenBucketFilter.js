import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { tokenBucket } from "#core/instance/tokenBucket.js";
import { defineFilter } from "#utils/defineUtil.js";

/** 订阅需限流的 API 路径正则列表 */
const needTokenApiSubscribe = new GetterContextSubscribe('NeedTokenApi', () => __env.get('api.tokenBucket.needToken', []).map(r => new RegExp(r)));

/**
 * 令牌桶限流过滤器
 * 优先级: -100
 * 作用: 对命中限流规则的接口进行令牌获取校验，获取不到令牌时返回 429 (Too Many Requests)
 */
export default defineFilter({
    order: -100,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (!tokenBucket.ready()) {
            resolve({ req, res, config });
        } else {
            const url = req.path;
            if (!needTokenApiSubscribe.getValue().some(r => r.test(url)) || tokenBucket.getToken()) {
                resolve({ req, res, config });
            } else {
                reject({ msg: `Too Many Requests.`, code: -429, status: 429 });
            }
        }
    }
});