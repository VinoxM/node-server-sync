import apiMethodConst from '../../../common/constants/apiMethodConst.js';
import { checkBodyKeyNotBlank, checkBodyKeyNotEmptyArray, checkBodyKeysNotBlank } from '../../../common/utils/preCheckUtil.js';
import rssFontsRep from '../../../modules/rss/repository/rssFontsRep.js';

const { POST } = apiMethodConst;

const needSecret = () => "mAou5820.rssFonts";

export default {
    basePath: "/rss/fonts",
    '/getAll': {
        method: POST,
        allowHosts: ['server.vinoxm.name', '28000--main--code-server--maou864--coder.vinoxm.cloud'],
        needSecret,
        callback: () => rssFontsRep.selectAll()
    },
    '/getFonts': {
        method: POST,
        allowHosts: ['server.vinoxm.name', '28000--main--code-server--maou864--coder.vinoxm.cloud'],
        needSecret,
        preCheck: req => checkBodyKeyNotEmptyArray(req, 'fonts'),
        callback: req => rssFontsRep.selectByTitles(req.body['fonts'])
    },
    '/addOne': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['title', 'minioLink']),
        callback: req => rssFontsRep.insertOne(req.body['title'], req.body['minioLink'])
    },
    '/updateOne': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeysNotBlank(req, ['id', 'title', 'minioLink']),
        callback: req => rssFontsRep.updateOne(req.body['id'], req.body['title'], req.body['minioLink'])

    },
    '/delOne': {
        method: POST,
        needAuth: true,
        needSecret,
        preCheck: req => checkBodyKeyNotBlank(req, 'id'),
        callback: req => rssFontsRep.deleteOne(req.body['id'])
    }
}