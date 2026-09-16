import apiMethodConst from "#constants/apiMethodConst.js";
import apiBodyConst from "#constants/apiBodyConst.js";
import { checkBodyKeyNotBlank } from "#utils/preCheckUtil.js";
import { addRssRegex, getRssRegex } from "#modules/anime/service/rss/rssRegexHistoryService.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { allowLanHosts } from "#common/constants/allowHostsConst.js";
import { defineRoutes } from "#common/utils/defineUtil.js";

const { REGEX } = apiBodyConst;
const { GET, POST } = apiMethodConst;

const needSecret = () => 'mAou5820.anime.rssRegex';
const needAuth = needAuthSingleClient.MANAGE;

/**
 * RSS 过滤正则表达式历史记录与权重管理路由模块 (`/anime/rss/regex/*`)
 */
export default defineRoutes({
    basePath: "/anime/rss/regex",

    /**
     * 获取高频使用的 RSS 过滤正则表达式历史列表（按使用频次和最近时间排序）
     */
    "/history": {
        method: GET,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        callback: () => {
            return getRssRegex();
        }
    },

    /**
     * 记录或增加一条 RSS 正则表达式的使用权重与时间戳
     * 请求体参数：{ regex: string }
     */
    "/add": {
        method: POST,
        needSecret,
        needAuth,
        allowHosts: allowLanHosts,
        preCheck: (req) => checkBodyKeyNotBlank(req, REGEX),
        callback: async (req) => {
            const regex = req.body[REGEX];
            return addRssRegex(regex).then(() => null);
        }
    }
});