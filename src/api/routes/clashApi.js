import { defineRoutes } from '#utils/defineUtil.js';
import apiHeaderConst from "#constants/apiHeaderConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkHeaderKeyValue, checkQueryKeyValue } from "#utils/preCheckUtil.js";
import { getRequestRealIp } from "#utils/requestUtil.js";
import clashFileNameConst from "#modules/clash/constants/clashFileNameConst.js";
import { concatClashYaml } from "#modules/clash/service/clashConcatService.js";
import { getClashFileContent } from "#modules/clash/service/clashService.js";
import { subscribeSources } from "#modules/clash/service/clashSubscribeService.js";

const { POST, GET } = apiMethodConst;
const { SECRET } = apiHeaderConst;

/** 获取 Clash 路由通信秘钥 */
const needSecret = () => "mAou5820.clash";

const clashFileName = 'config.yml';

/**
 * Clash 代理配置分发与订阅管理路由模块 (`/clash/*`)
 */
export default defineRoutes({
    basePath: "/clash",

    /**
     * 订阅客户端拉取 Clash 配置文件接口
     * 支持请求头 `secret` 或查询参数 `?secret=...` 鉴权，支持 `?type=tailscale` 切换融合配置
     */
    ["/" + clashFileName]: {
        method: GET,
        ignoreReturn: true,
        ignoreSecret: true,
        preCheck: (/** @type {ApiRequest} */ req) => {
            try {
                checkHeaderKeyValue(req, SECRET, needSecret(), { errorStatus: 400 });
            } catch (error) {
                checkQueryKeyValue(req, SECRET, needSecret(), { errorStatus: 400 });
            }
        },
        callback: async (/** @type {ApiRequest} */ req, /** @type {ApiResponse} */ res) => {
            const type = req.query?.type;
            const fileName = type === 'tailscale' ? clashFileNameConst.TAILSCALE_LATEST_FILE_NAME : clashFileNameConst.LATEST_FILE_NAME;
            const headerFileName = encodeURIComponent(clashFileName);
            const result = await getClashFileContent(fileName);
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'text/plain;charset=UTF8',
                'Content-Disposition': `attachment; filename="${headerFileName}"; filename*=UTF-8''${headerFileName}`
            };
            Object.assign(headers, result.headers);
            res.writeHead(200, headers);
            res.end(result.content);
        }
    },

    /**
     * 手动触发更新所有远程 Clash 订阅源
     */
    "/subscribe": {
        method: POST,
        needSecret,
        callback: (/** @type {ApiRequest} */ req) => {
            const realIp = getRequestRealIp(req);
            return subscribeSources(realIp);
        }
    },

    /**
     * 手动触发合并生成最新 Clash 配置文件 (latest.yaml / config.yaml)
     */
    "/concat": {
        method: POST,
        needSecret,
        callback: () => concatClashYaml()
    }
});
