import { allowLanHosts } from "#constants/allowHostsConst.js";
import apiMethodConst from "#constants/apiMethodConst.js";
import { checkBodyKeyMatch, checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from "#utils/preCheckUtil.js";
import { defineRoutes } from "#common/utils/defineUtil.js";
import { getRssCardFailedViews, getSubscribeBySubjectId, updateSubscribe } from "#modules/anime/service/rssService.js";
import { needAuthSingleClient } from "#common/constants/authorizationConst.js";
import { getEpisodeMatches } from "#modules/anime/service/rss/rssResultService.js";
import { analysisRssSubscribe, createSubscribeBySubjectId } from "#modules/anime/service/rss/rssSubscribeService.js";

const { GET, POST } = apiMethodConst;
const needSecret = () => "mAou5820.anime.rss";

/**
 * RSS 订阅与规则管理路由模块 (`/anime/rss/*`)
 */
export default defineRoutes({
    basePath: "/anime/rss",

    /**
     * 获取全局配置的 RSS 标题过滤正则规则列表
     */
    '/getRssMatchers': {
        method: GET,
        allowHosts: allowLanHosts,
        needSecret,
        callback: () => __env.get("rss.matchers", [])
    },

    /**
     * 获取全局配置的集数/话数提取正则模板列表
     */
    '/getEpisodeMatchers': {
        method: GET,
        allowHosts: allowLanHosts,
        needSecret,
        callback: () => getEpisodeMatches()
    },

    /**
     * 获取 RSS 异常处理卡片概览数量（解析失败剧集数与字幕失败数）
     */
    '/getCardFailedViews': {
        method: GET,
        needAuth: needAuthSingleClient.MANAGE,
        allowHosts: allowLanHosts,
        ignoreAccessPrint: true,
        ignoreReturnPrint: true,
        needSecret,
        callback: () => getRssCardFailedViews()
    },

    /**
     * 根据番剧 ID 获取对应的订阅规则配置（解析 JSON 正则与别名）
     * 请求体参数：{ subjectId: number }
     */
    '/getSubjectSubscribe': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'subjectId'),
        callback: req => getSubscribeBySubjectId(req.body.subjectId)
    },

    /**
     * 为指定番剧初始化创建默认订阅记录
     * 请求体参数：{ subjectId: number }
     */
    '/initSubjectSubscribe': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeyNotBlank(req, 'subjectId'),
        callback: req => {
            const { subjectId } = req.body;
            return createSubscribeBySubjectId(subjectId);
        }
    },

    /**
     * 更新番剧订阅配置（URL、正则、开播时间、连载状态等）
     * 请求体参数：{ subsId: number, startTime: string, goon: 0|1, url: string, regex: string }
     */
    '/updateSubscribe': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: req => checkBodyKeysNotBlank(req, ['subsId', 'startTime'])
            && checkBodyKeyMatch(req, 'goon', [/[01]/])
            && checkBodyKeysExists(req, ['url', 'regex']),
        callback: req => updateSubscribe(req.body)
    },

    /**
     * 测试指定 RSS URL 和正则表达式的抓取解析结果
     * 请求体参数：{ url: string, regex?: string }
     */
    "/subscribeTest": {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        allowHosts: allowLanHosts,
        preCheck: (req) => checkBodyKeyNotBlank(req, 'url'),
        callback: async (req) => {
            const results = await analysisRssSubscribe({ regex: req.body.regex, url: req.body.url });
            return results.map(item => ({ title: item.title, pubDate: item.pubDate, torrent: item.torrent }));
        }
    }
});