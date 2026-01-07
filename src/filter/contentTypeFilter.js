import { parse as contentTypeParse } from 'content-type';
import apiContentTypeConst from '../constraints/apiContentTypeConst.js';
import apiMethodConst from '../constraints/apiMethodConst.js';

const { POST } = apiMethodConst
const { TYPE_JSON } = apiContentTypeConst

export default {
    order: -90,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (req.method === POST) {
            if (!req.headers.hasOwnProperty('content-type') || contentTypeParse(req.headers['content-type']).type !== (config?.acceptType || TYPE_JSON)) {
                return reject({ code: -5, msg: 'Unsupported Content Type.' });
            }
        }
        resolve({ req, res, config });
    }
}