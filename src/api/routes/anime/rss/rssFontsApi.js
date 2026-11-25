import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { allowLanCIDR as allowCIDR } from '#constants/allowHostsConst.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from '#common/utils/preCheckUtil.js';
import rssFontsRep from '#modules/anime/repository/rss/rssFontsRep.js';
import { defineRoutes } from '#common/utils/defineUtil.js';

const { POST } = apiMethodConst;
const needSecret = () => "mAou5820.anime.rssFonts";

/**
 * RSS 字幕内嵌字体库管理路由模块 (`/anime/rss/fonts/*`)
 */
export default defineRoutes({
    basePath: "/anime/rss/fonts",

    /**
     * 获取全量已持久化的字体库列表
     */
    '/getAll': {
        method: POST,
        allowCIDR,
        needSecret,
        callback: () => rssFontsRep.selectAll()
    },

    /**
     * 根据字体名称列表批量查询已存在的字体信息
     * 请求体参数：{ fonts: string[] }
     */
    '/getFonts': {
        method: POST,
        allowCIDR,
        needSecret,
        preCheck: req => checkBodyKeyNotEmptyArray(req, 'fonts'),
        callback: req => rssFontsRep.selectByTitles(req.body['fonts'])
    },

    /**
     * 手动新增单个字体记录
     * 请求体参数：{ title: string, minioLink: string }
     */
    '/addOne': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        allowCIDR,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['title', 'minioLink']),
        callback: req => rssFontsRep.insertOne(req.body['title'], req.body['minioLink'])
    },

    /**
     * 更新单个字体记录信息
     * 请求体参数：{ id: number, title: string, minioLink: string }
     */
    '/updateOne': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        allowCIDR,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'title', 'minioLink']),
        callback: req => rssFontsRep.updateOne(req.body['id'], req.body['title'], req.body['minioLink'])
    },

    /**
     * 删除单个字体记录
     * 请求体参数：{ id: number }
     */
    '/delOne': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        allowCIDR,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => rssFontsRep.deleteOne(req.body['id'])
    }
});