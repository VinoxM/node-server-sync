import { needAuthSingleClient } from '#common/constants/authorizationConst.js';
import { allowLanHosts } from '#constants/allowHostsConst.js';
import apiMethodConst from '#constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from '#common/utils/preCheckUtil.js';
import rssFontsRep from '#modules/anime/repository/rss/rssFontsRep.js';

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.anime.rssFonts";

export default {
    basePath: "/anime/rss/fonts",
    '/getAll': {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        callback: () => rssFontsRep.selectAll()
    },
    '/getFonts': {
        method: POST,
        allowHosts: allowLanHosts,
        needSecret,
        preCheck: req => checkBodyKeyNotEmptyArray(req, 'fonts'),
        callback: req => rssFontsRep.selectByTitles(req.body['fonts'])
    },
    '/addOne': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['title', 'minioLink']),
        callback: req => rssFontsRep.insertOne(req.body['title'], req.body['minioLink'])
    },
    '/updateOne': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'title', 'minioLink']),
        callback: req => rssFontsRep.updateOne(req.body['id'], req.body['title'], req.body['minioLink'])

    },
    '/delOne': {
        method: POST,
        needAuth: needAuthSingleClient.MANAGE,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => rssFontsRep.deleteOne(req.body['id'])
    }
}