import apiHeaderConst, { defaultSecret } from "#constants/apiHeaderConst.js";
import { checkHeaderKeyValue } from "#utils/preCheckUtil.js";
import { defineFilter } from "#utils/defineUtil.js";

/**
 * 获取全局默认的通信签名 Secret
 * @returns {string} 默认通信密钥
 */
function getDefaultSecret() {
    return __env.get('api.defaultSecret', defaultSecret);
}

/**
 * 通信签名 Secret 校验过滤器
 * 优先级: -80
 * 作用: 校验请求头中的 Secret 签名（Base64 编码）是否与路由配置或系统默认密钥匹配
 */
export default defineFilter({
    order: -80,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const { ignoreSecret, needSecret = getDefaultSecret } = config;
        try {
            (!ignoreSecret && needSecret && checkHeaderKeyValue(req, apiHeaderConst.SECRET, btoa(needSecret())));
        } catch (error) {
            return reject(error);
        }
        resolve({ req, res, config });
    },
});