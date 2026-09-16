import apiMethodConst from "#constants/apiMethodConst.js";
import apiBodyConst from "#constants/apiBodyConst.js";
import { checkBodyKeyMatch, checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import { addOneResult, deleteAllSubscribeResults, deleteOneResult, editOneResult, getResultsBySubsId, hideOneResult } from "#modules/anime/service/rss/rssResultService.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { defineRoutes } from "#common/utils/defineUtil.js";

const { POST } = apiMethodConst;
const { ID, PID, TORRENT, TITLE, PUB_DATE, HIDE } = apiBodyConst;
const needAuth = needAuthSingleClient.MANAGE;
const needSecret = () => 'mAou5820.anime.rssResult';

/**
 * RSS 抓取结果条目管理路由模块 (`/anime/rss/result/*`)
 */
export default defineRoutes({
    basePath: "/anime/rss/result",

    /**
     * 根据订阅 ID 查询抓取到的 RSS 结果列表（拼接完整 Magnet 链接）
     * 请求体参数：{ subsId: number }
     */
    "/getResults": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'subsId'),
        callback: async (req) => getResultsBySubsId(req.body.subsId)
    },

    /**
     * 删除单条 RSS 抓取条目
     * 请求体参数：{ id: number }
     */
    "/delOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, ID),
        callback: async (req) => deleteOneResult(req.body[ID])
    },

    /**
     * 批量删除指定订阅下的全部抓取结果
     * 请求体参数：{ pid: number }
     */
    "/delMany": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, PID),
        callback: async (req) => deleteAllSubscribeResults(req.body[PID])
    },

    /**
     * 伪删除/恢复（隐藏或显示）单条 RSS 抓取条目
     * 请求体参数：{ id: number, hide: 0|1 }
     */
    "/hideOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, ID) && checkBodyKeyMatch(req, HIDE, [/[01]/]),
        callback: async (req) => hideOneResult(req.body[ID], req.body[HIDE])
    },

    /**
     * 手动新增单条 RSS 抓取条目
     * 请求体参数：{ pid: number, title: string, torrent: string, pubDate?: string }
     */
    "/addOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, [PID, TITLE, TORRENT]) && checkBodyKeysExists(req, [PUB_DATE]),
        callback: async (req) => addOneResult(req.body)
    },

    /**
     * 手动修改单条 RSS 抓取条目信息
     * 请求体参数：{ id: number, title: string, torrent: string, pubDate?: string }
     */
    "/editOne": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, [ID, TITLE, TORRENT]) && checkBodyKeysExists(req, [PUB_DATE]),
        callback: async (req) => editOneResult(req.body)
    }
});