import { defineFilter } from "#utils/defineUtil.js";

/**
 * 路由参数前置校验过滤器
 * 优先级: -50
 * 作用: 执行路由配置项中的 preCheck 校验函数（如参数非空、正则等校验）
 */
export default defineFilter({
    order: -50,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const { preCheck } = config;
        try {
            (__isFunction(preCheck) && preCheck(req));
        } catch (error) {
            return reject(error);
        }
        resolve({ req, res, config });
    }
});