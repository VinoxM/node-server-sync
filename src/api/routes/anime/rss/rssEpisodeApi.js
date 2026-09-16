import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeysExists, checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import rssEpisodeRep from '#modules/anime/repository/rss/rssEpisodeRep.js';
import {
    deleteOneEpisode, deleteOneFailedEpisode,
    retryFailedEpisode, updateEpisodeStatus, updateFailedEpisode
} from '#modules/anime/service/rss/rssEpisodeService.js';
import { allowLanHosts } from '#constants/allowHostsConst.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { defineRoutes } from '#common/utils/defineUtil.js';

const { POST } = apiMethodConst;
const needAuth = needAuthSingleClient.MANAGE;
const needSecret = () => "mAou5820.anime.rssEpisode";

/**
 * RSS 剧集与异常解析管理路由模块 (`/anime/rss/episode/*`)
 */
export default defineRoutes({
    basePath: "/anime/rss/episode",

    /**
     * 更新剧集状态（供下载服务完成钩子或任务调度回调）
     * 请求体参数：{ id: number, status: string }
     */
    '/updateEpisodeStatus': {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'status']),
        callback: req => updateEpisodeStatus(req.body.id, req.body.status)
    },

    /**
     * 获取指定订阅下已成功解析入库的剧集列表
     * 请求体参数：{ rssSubsId: number }
     */
    '/getEpisodes': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssEpisodeRep.selectBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },

    /**
     * 删除单条已入库剧集（同步清理 MinIO 媒体文件）
     * 请求体参数：{ episodeId: number }
     */
    "/deleteEpisode": {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'episodeId'),
        callback: req => deleteOneEpisode(req.body.episodeId)
    },

    /**
     * 获取指定订阅下解析失败的异常剧集记录列表
     * 请求体参数：{ rssSubsId: number }
     */
    '/getFailedEpisodes': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssEpisodeRep.selectFailedBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },

    /**
     * 重试解析异常剧集（抽取 MKV 字幕/字体、转码 MP4、转存 MinIO 并流式输出进度）
     * 请求体参数：{ failedEpisodeId: number }
     */
    '/retryFailedEpisode': {
        method: POST,
        needAuth,
        needSecret,
        maybeStream: true,
        preCheck: req => checkBodyKeyNotBlank(req, 'failedEpisodeId'),
        callback: req => retryFailedEpisode(req.body.failedEpisodeId)
    },

    /**
     * 手动修正更新异常剧集的信息（文件名、集数、路径等）
     * 请求体参数：{ id: number, rootPath: string, fileName: string, episode?: string, link?: string }
     */
    '/updateFailedEpisode': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'rootPath', 'fileName']) && checkBodyKeysExists(req, ['episode', 'link']),
        callback: req => updateFailedEpisode(req.body)
    },

    /**
     * 删除指定的异常剧集记录
     * 请求体参数：{ failedEpisodeId: number }
     */
    '/deleteFailedEpisode': {
        method: POST,
        needAuth,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'failedEpisodeId'),
        callback: req => deleteOneFailedEpisode(req.body.failedEpisodeId)
    }
});