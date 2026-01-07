import { isRssUpdating } from '../handler/rss/rssSubscribeHandler.js';

export default {
    order: -70,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const rssUpdatingApi = __env.get("rss.awaitRssUpdating", []);
        const url = req.path;
        if (rssUpdatingApi.some(r => new RegExp(r).test(url)) && isRssUpdating()) {
            return reject({ code: -5, msg: 'Rss is updating.' })
        }
        resolve({ req, res, config });
    }
}