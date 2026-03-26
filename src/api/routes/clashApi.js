import apiHeaderConst from "../../common/constants/apiHeaderConst.js";
import apiMethodConst from "../../common/constants/apiMethodConst.js";
import { checkHeaderKeyValue, checkQueryKeyValue } from "../../common/utils/preCheckUtil.js";
import { getRequestRealIp } from "../../common/utils/requestUtil.js";
import { concatClashYaml } from "../../modules/clash/service/clashConcatService.js";
import { getClashFileContent } from "../../modules/clash/service/clashService.js";
import { subscribeSources } from "../../modules/clash/service/clashSubscribeService.js";

const { POST, GET } = apiMethodConst;
const { SECRET } = apiHeaderConst;

const needSecret = () => "mAou5820.clash";

const clashFileName = 'config.yml'

export default {
    basePath: "/clash",
    ["/" + clashFileName]: {
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
        callback: async (_, res) => getClashFileContent().then(result => {
            const fileName = encodeURIComponent(clashFileName)
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain;charset=UTF8',
                'Content-Disposition': `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`
            }
            Object.assign(headers, result.headers);
            res.writeHead(200, headers);
            res.end(result.content);
        })
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
