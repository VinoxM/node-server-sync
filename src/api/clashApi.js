import apiMethodConst from '../constraints/apiMethodConst.js';
import apiHeaderConst from '../constraints/apiHeaderConst.js';
import apiContentTypeConst from '../constraints/apiContentTypeConst.js';
import { checkHeaderKeyValue, checkQueryKeyValue } from '../common/apiPreCheck.js';
import { updateClashSubInfo, getClashFileContent, backupConfigYaml } from '../handler/clashHandler.js';
import { getRequestRealIp } from '../common/httpUtil.js';

const { POST, GET } = apiMethodConst;
const { SECRET } = apiHeaderConst;
const { TYPE_TEXT } = apiContentTypeConst;

const needSecret = () => "mAou5820.clash";

export default {
    basePath: "/clash",
    "/update": {
        method: POST,
        needSecret,
        callback: req => {
            const realIp = getRequestRealIp(req)
            return updateClashSubInfo(realIp);
        }
    },
    "/config.yml": {
        method: GET,
        ignoreReturn: true,
        ignoreSecret: true,
        preCheck: (req) => {
            try {
                checkHeaderKeyValue(req, SECRET, needSecret(), { errorStatus: 400 });
            } catch (error) {
                checkQueryKeyValue(req, SECRET, needSecret(), { errorStatus: 400 });
            }
        },
        callback: async (_, res) => {
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain;charset=UTF8'
            }
            return getClashFileContent().then(result => {
                Object.assign(headers, result.headers);
                res.writeHead(200, headers);
                res.end(result.content);
            })
        }
    },
    "/upload": {
        method: POST,
        needSecret,
        acceptType: TYPE_TEXT,
        callback: (req) => {
            return new Promise(resolve => {
                backupConfigYaml(req.body);
                resolve();
            })
        }
    }
}
