import apiMethodConst from '../constraints/apiMethodConst.js';
import apiHeaderConst from '../constraints/apiHeaderConst.js';
import { checkHeaderKeyValue, checkQueryKeyValue } from '../common/apiPreCheck.js';
import { getClashFileContent } from '../handler/clash/clashHandler.js';
import { getRequestRealIp } from '../common/httpUtil.js';
import { subscribeSources } from '../handler/clash/clashSubscribeHandler.js';
import { concatClashYaml } from '../handler/clash/clashConcatHandler.js';

const { POST, GET } = apiMethodConst;
const { SECRET } = apiHeaderConst;

const needSecret = () => "mAou5820.clash";

export default {
    basePath: "/clash",
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
    "/subscribe": {
        method: POST,
        needSecret,
        callback: req => {
            const realIp = getRequestRealIp(req)
            return subscribeSources(realIp);
        }
    },
    "/concat": {
        method: POST,
        needSecret,
        callback: () => concatClashYaml()
    }
}
