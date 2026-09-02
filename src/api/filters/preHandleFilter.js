import { defineFilter } from "#utils/defineUtil.js";

/**
 * 路由参数前置预处理过滤器
 * 优先级: -49
 * 作用: 执行路由配置项中的 preHandle 预处理函数（如请求体特定字段的密文自动解密）
 */
export default defineFilter({
    order: -49,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const { preHandle } = config;
        try {
            (__isFunction(preHandle) && preHandle(req));
        } catch (error) {
            return reject(error);
        }
        resolve({ req, res, config });
    }
});