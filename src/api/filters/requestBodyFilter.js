import iconv from 'iconv-lite';
import { parse as contentTypeParse } from 'content-type';
import { parse as queryStringParse } from 'querystring';
import { parseMultipart } from '../../common/utils/multipartUtil.js';
import { GetterContextSubscribe } from '../../core/context/subscribe.js';
import apiMethodConst from '../../common/constants/apiMethodConst.js';
import apiContentTypeConst from '../../common/constants/apiContentTypeConst.js';

const { POST } = apiMethodConst;
const { TYPE_JSON, TYPE_FORM, TYPE_TEXT, TYPE_MULTIPART } = apiContentTypeConst;

const PARSE_STRATEGIES = {
    [TYPE_JSON]: (buffer, charset) => JSON.parse(iconv.decode(buffer, charset || 'utf8')),
    [TYPE_FORM]: (buffer, charset) => queryStringParse(iconv.decode(buffer, charset || 'utf8')),
    [TYPE_TEXT]: (buffer, charset) => iconv.decode(buffer, charset || 'utf8'),
    [TYPE_MULTIPART]: (buffer, charset, req) => {
        const boundary = req.headers['content-type'].split('boundary=')[1];
        if (!boundary) throw { code: -4, msg: 'Invalid multipart boundary', status: 400 };
        return parseMultipart(buffer, boundary);
    }
};

const defaultRequestBodyLimit = 5 * 1024 * 1024;
const requestBodyLimit = new GetterContextSubscribe('RequestBodyLimit', () => __env.getEvaluate('api.requestBodyLimit', defaultRequestBodyLimit));

export default {
    order: -60,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (req.method !== POST) return resolve({ req, res, config });
        const contentType = contentTypeParse(req.headers['content-type']);
        const strategy = PARSE_STRATEGIES[contentType.type];
        if (!strategy) {
            return reject({ code: -5, msg: 'Unsupported ContentType.', status: 415 });
        }

        const maxLimit = config?.bodyLimit ?? requestBodyLimit.getValue() ?? defaultRequestBodyLimit;
        let receivedLength = 0;
        const chunks = [];

        req.on('data', (chunk) => {
            receivedLength += chunk.length;
            if (receivedLength > maxLimit) {
                req.destroy();
                return reject({ code: -7, msg: 'Payload Too Large', status: 413 });
            }
            chunks.push(chunk);
        });

        req.on('end', () => {
            try {
                const fullBuffer = Buffer.concat(chunks);
                const charset = contentType.parameters?.charset;
                const result = strategy(fullBuffer, charset, req);
                if (contentType.type === TYPE_MULTIPART) {
                    req.body = result.fields;
                    req.files = result.files;
                } else {
                    req.body = result;
                }
                resolve({ req, res, config });
            } catch (error) {
                reject({
                    code: -1,
                    msg: 'Analysis RequestBody data error.',
                    status: 400,
                    error: error.message
                });
            }
        });

        req.on('error', (err) => {
            reject({ code: -8, msg: 'Stream Error', error: err });
        });
    }
}