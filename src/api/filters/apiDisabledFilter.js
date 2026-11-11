import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { defineFilter } from "#utils/defineUtil.js";
import { API_FILTER_ORDER } from "#constants/filterOrderConst.js";

/** 订阅 IP 封禁器忽略检查的 API 路径正则列表 */
const apiDisabledRegex = new GetterContextSubscribe('apiDisabled', () => __env.get("api.apiDisabled", []).map(r => new RegExp(r)));

/**
 * API 动态禁用拦截器
 * 优先级: -200
 * 作用: 动态调整
 */
export default defineFilter({
    order: API_FILTER_ORDER.API_DISABLED,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const url = req.path;
        if (apiDisabledRegex.getValue().some(r => r.test(url))) {
            reject({ code: -404, status: 404 });
        } else {
            resolve({ req, res, config });
        }
    }
});