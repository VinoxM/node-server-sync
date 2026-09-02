import { parse as contentTypeParse } from 'content-type';
import apiMethodConst from '#constants/apiMethodConst.js';
import apiContentTypeConst from '#constants/apiContentTypeConst.js';
import { defineFilter } from '#utils/defineUtil.js';

const { POST } = apiMethodConst;
const { TYPE_JSON } = apiContentTypeConst;

/**
 * Content-Type 请求类型过滤器
 * 优先级: -90
 * 作用: 校验 POST 请求的 Content-Type 是否与接口配置的 acceptType（默认 application/json）一致
 */
export default defineFilter({
    order: -90,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (req.method === POST) {
            if (!req.headers.hasOwnProperty('content-type') || contentTypeParse(req.headers['content-type']).type !== (config?.acceptType || TYPE_JSON)) {
                return reject({ code: -5, msg: 'Unsupported Content Type.' });
            }
        }
        resolve({ req, res, config });
    }
});