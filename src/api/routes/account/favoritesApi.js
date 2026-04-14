import apiMethodConst from '../../../common/constants/apiMethodConst.js';
import { checkBodyKeysNotBlank } from '../../../common/utils/preCheckUtil.js';
import { addUserFavorite, filterUserRssFavoritesWithUid, removeUserFavorite } from '../../../modules/account/service/rssFavoritesService.js';

const { POST } = apiMethodConst

const needSecret = () => 'mAou5820.userFavorites'

export default {
    basePath: "/favorites",
    '/getUserSubscriptions': {
        method: POST,
        needSecret,
        needAuth: true,
        callback: async req => {
            const subsIds = req.body['subsIds']
            const uid = req.userInfo.id
            return filterUserRssFavoritesWithUid(uid, subsIds).then(data => Array.from(data).map(d => d.rssSubscribeId))
        }
    },
    '/userSubscription/add': {
        method: POST,
        needSecret,
        needAuth: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['rssSubsId']),
        callback: req => {
            const { rssSubsId } = req.body
            const { id: uid } = req.userInfo
            if (Number.isInteger(uid) && Number.isInteger(rssSubsId)) {
                return addUserFavorite(uid, rssSubsId)
            }
            __throwMessage('Unsupported parameter type.', -1, 400)
        }
    },
    '/userSubscription/del': {
        method: POST,
        needSecret,
        needAuth: true,
        preCheck: req => checkBodyKeysNotBlank(req, ['rssSubsId']),
        callback: req => {
            const { rssSubsId } = req.body
            const { id: uid } = req.userInfo
            if (Number.isInteger(uid) && Number.isInteger(rssSubsId)) {
                return removeUserFavorite(uid, rssSubsId)
            }
            __throwMessage('Unsupported parameter type.', -1, 400)
        }
    }
}