import { checkBodyKeysNotBlank } from '../../common/apiPreCheck.js';
import { pushNotification } from '../../sockets/notification.js';
import { getRequestRealIp } from '../../common/httpUtil.js';
import { pushRssSubscription } from '../../sockets/rssSubscription.js';

const needSecret = () => 'mAou5820.notification';

export default {
    basePath: '/notification',
    '/pushMessage': {
        disabled: true,
        method: 'post',
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['message']),
        callback: (req) => {
            const realIp = getRequestRealIp(req);
            return pushNotification(req.body.message, realIp);
        }
    },
    '/pushRssSubscription': {
        disabled: true,
        method: 'post',
        needSecret,
        preCheck: (req) => checkBodyKeysNotBlank(req, ['message']),
        callback: (req) => {
            const realIp = getRequestRealIp(req);
            return pushRssSubscription(JSON.stringify(req.body.message), realIp);
        }
    }
}