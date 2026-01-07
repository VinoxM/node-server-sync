import { checkBodyKeysNotBlank } from '../../common/apiPreCheck.js';
import apiMethodConst from '../../constraints/apiMethodConst.js';
import rssFavoritesRep from '../../repository/account/rssFavoritesRep.js';

const { POST, GET } = apiMethodConst

const needSecret = () => 'mAou5820.userFavorites'

export default {
    basePath: "/favorites",
    '/getUserSubscriptions': {
        method: GET,
        needSecret,
        needAuth: true,
        ignoreOutput: true,
        callback: req => {
            return rssFavoritesRep.selectUserFavorites(req.userInfo.id).then(data => Array.from(data).map(d => d.rssSubscribeId))
        }
    },
    '/userSubscription/add': {
        method: POST,
        needSecret,
        needAuth: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['rssSubsId']),
        ignoreOutput: true,
        callback: req => {
            const { rssSubsId } = req.body
            const { id: uid } = req.userInfo
            if (Number.isInteger(uid) && Number.isInteger(rssSubsId)) {
                return rssFavoritesRep.insertUserFavorite(uid, rssSubsId).then(rows => ({ rows }))
            }
            throwMessage('Unsupported paramater type.', -1, 400)
        }
    },
    '/userSubscription/del': {
        method: POST,
        needSecret,
        needAuth: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['rssSubsId']),
        ignoreOutput: true,
        callback: req => {
            const { rssSubsId } = req.body
            const { id: uid } = req.userInfo
            if (Number.isInteger(uid) && Number.isInteger(rssSubsId)) {
                return rssFavoritesRep.deleteUserFavorite(uid, rssSubsId).then(rows => ({ rows }))
            }
            throwMessage('Unsupported paramater type.', -1, 400)
        }
    }
}