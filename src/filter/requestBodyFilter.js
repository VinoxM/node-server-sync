import iconv from 'iconv-lite';
import { parse as contentTypeParse } from 'content-type';
import { parse as queryStringParse } from 'querystring';
import { parseMultipart } from '../common/multipartUtil.js';
import apiMethodConst from "../constraints/apiMethodConst.js";
import apiContentTypeConst from '../constraints/apiContentTypeConst.js';

const { POST } = apiMethodConst;
const { TYPE_JSON, TYPE_FORM, TYPE_TEXT, TYPE_MULTIPART } = apiContentTypeConst;

export default {
    order: -60,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        if (req.method !== POST) return resolve({ req, res, config });
        let data = [];
        const contentType = contentTypeParse(req.headers['content-type']);
        if (contentType.type === TYPE_JSON) {
            req.on('data', buff => {
                data.push(buff);
            })
            req.on('end', () => {
                // data = Buffer.concat(data).toString();
                if (contentType.parameters?.charset) {
                    data = iconv.decode(Buffer.concat(data), contentType.parameters.charset);
                }
                try {
                    req.body = JSON.parse(data);
                    resolve({ req, res, config });
                } catch (error) {
                    reject({ code: -1, msg: 'Analysis RequestBody data error.', error })
                }
            })
        } else if (contentType.type === TYPE_FORM) {
            req.on('data', buff => {
                data.push(buff);
            })
            req.on('end', () => {
                data = Buffer.concat(data).toString();
                if (contentType.parameters?.charset) {
                    data = iconv.decode(data, contentType.parameters.charset);
                }
                try {
                    req.body = queryStringParse(data);
                    resolve({ req, res, config });
                } catch (error) {
                    reject({ code: -1, msg: 'Analysis RequestBody data error.', error })
                }
            })
        } else if (contentType.type === TYPE_TEXT) {
            req.on('data', buff => {
                data.push(buff);
            })
            req.on('end', () => {
                data = Buffer.concat(data).toString();
                if (contentType.parameters?.charset) {
                    data = iconv.decode(data, contentType.parameters.charset);
                }
                req.body = data;
                resolve({ req, res, config });
            })
        } else if (contentType.type === TYPE_MULTIPART) {
            const boundary = req.headers['content-type'].split('boundary=')[1];
            if (!boundary) {
                reject({ code: -4, msg: 'Invalid multipart form data', status: 400 });
            } else {
                req.on('data', buff => {
                    data.push(buff);
                })
                req.on('end', () => {
                    data = Buffer.concat(data)
                    const { files, fields } = parseMultipart(data, boundary)
                    req.files = files
                    req.body = fields
                    resolve({ req, res, config });
                })
            }
        } else {
            reject({ code: -5, msg: 'Unsupported ContentType.' })
        }
    }
}