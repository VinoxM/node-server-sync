import { ipBlocker } from "#core/instance/ipBlocker.js";
import { getRequestRealIp } from "#utils/requestUtil.js";
import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { defineFilter } from "#utils/defineUtil.js";

/** 订阅 IP 封禁器忽略检查的 API 路径正则列表 */
const ipBlockIgnoreRegex = new GetterContextSubscribe('ipBlockIgnore', () => __env.get("api.ipBlocker.blockIgnore", []).map(r => new RegExp(r)));

/**
 * 恶意 IP 拦截与封禁过滤器
 * 优先级: -110
 * 作用: 检测请求真实 IP 是否已被 ipBlocker 拦截器封禁，已被封禁的 IP 将直接切断连接
 */
export default defineFilter({
    order: -110,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (!ipBlocker.ready()) {
            resolve({ req, res, config });
        } else {
            const url = req.path;
            const realIp = getRequestRealIp(req);
            if (ipBlockIgnoreRegex.getValue().some(r => r.test(url)) || ipBlocker.check(realIp)) {
                resolve({ req, res, config });
            } else {
                req.destroy();
                reject({ msg: 'Forbidden.', code: -403, status: 403 });
            }
        }
    }
});