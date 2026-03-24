import { GetterContextSubscribe } from '../context/subscribe.js';
import { isRssUpdating } from '../handler/rss/rssSubscribeHandler.js';

const rssUpdatingApiRegex = new GetterContextSubscribe('RssUpdatingApi', () => __env.get("rss.awaitRssUpdating", []).map(r => new RegExp(r)))

export default {
    order: -70,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const url = req.path;
        if (isRssUpdating() && rssUpdatingApiRegex.getValue().some(r => r.test(url))) {
            return reject({ code: -5, msg: 'Rss is updating.' })
        }
        resolve({ req, res, config });
    }
}