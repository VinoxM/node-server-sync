import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysExists, checkBodyKeysNotBlank } from '#utils/preCheckUtil.js';
import rssSubtitleRep from '#modules/anime/repository/rss/rssSubtitleRep.js';
import {
    deleteEpisodeSubtitle, deleteEpisodeSubtitleBatch, deleteEpisodeSubtitleFile, getRssSubtitleMatchers,
    recalculateEpisodeSubtitleFonts, retryUploadEpisodeSubtitle, updateEpisodeSubtitle
} from '#modules/anime/service/rss/rssSubtitleService.js';
import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { allowLanHosts } from '#common/constants/allowHostsConst.js';
import { defineRoutes } from '#common/utils/defineUtil.js';

const { POST } = apiMethodConst;
const needSecret = () => "mAou5820.anime.rssSubtitle";

/**
 * RSS 剧集字幕管理路由模块 (`/anime/rss/subtitle/*`)
 */
export default defineRoutes({
    basePath: "/anime/rss/subtitle",

    /**
     * 获取指定订阅下的所有已解析字幕列表
     * 请求体参数：{ rssSubsId: number }
     */
    '/getSubtitles': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'rssSubsId'),
        callback: req => rssSubtitleRep.selectBySubsId(req.body.rssSubsId).then(({ data }) => data)
    },

    /**
     * 更新字幕信息（集数、标题、关联字体、文件路径等）
     * 请求体参数：{ id: number, episode?: string, title?: string, fonts?: string|string[], rootPath?: string, fileName?: string, minioLink?: string }
     */
    '/updateSubtitle': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']) && checkBodyKeysExists(req, ['episode', 'title', 'fonts', 'rootPath', 'fileName', 'minioLink']),
        callback: req => updateEpisodeSubtitle(req.body)
    },

    /**
     * 重试将失败的字幕文件上传至 MinIO
     * 请求体参数：{ id: number }
     */
    '/retryUploadEpisodeSubtitle': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => retryUploadEpisodeSubtitle(req.body.id)
    },

    /**
     * 重新扫描 MinIO 上的 ASS 字幕文件并回填引用的字体列表
     * 请求体参数：{ id: number }
     */
    '/recalculateAssSubtitleFonts': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => recalculateEpisodeSubtitleFonts(req.body.id)
    },

    /**
     * 级联删除字幕记录（同时删除 MinIO 对象与本地临时文件）
     * 请求体参数：{ id: number }
     */
    '/deleteSubtitle': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => deleteEpisodeSubtitle(req.body.id)
    },

    /**
     * 批量级联删除字幕记录（同时删除 MinIO 对象与本地临时文件）
     * 请求体参数：{ ids: Array<number> }
     */
    '/deleteSubtitleBatch': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotEmptyArray(req, 'ids'),
        callback: req => deleteEpisodeSubtitleBatch(req.body.ids)
    },

    /**
     * 仅删除字幕对应的本地物理文件并标记状态
     * 请求体参数：{ id: number }
     */
    '/deleteSubtitleFile': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id']),
        callback: req => deleteEpisodeSubtitleFile(req.body.id)
    },

    /**
     * 获取配置的字幕标题/语言提取正则匹配规则列表
     */
    '/getSubtitleMatchers': {
        method: POST,
        needSecret,
        allowHosts: allowLanHosts,
        callback: () => getRssSubtitleMatchers()
    }
});