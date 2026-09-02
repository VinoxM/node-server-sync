import { GetterContextSubscribe } from "#core/context/subscribe.js";
import { isRssUpdating } from "#modules/rss/service/rssSubscribeService.js";
import { defineFilter } from "#utils/defineUtil.js";

/** 订阅 RSS 正在更新时需阻塞/拦截的 API 路径正则列表 */
const rssUpdatingApiRegex = new GetterContextSubscribe('RssUpdatingApi', () => __env.get("rss.awaitRssUpdating", []).map(r => new RegExp(r)));

/**
 * RSS 订阅更新状态互斥过滤器
 * 优先级: -70
 * 作用: 当后台正在执行 RSS 更新任务时，拦截并拒绝指定接口的访问，防止并发数据冲突
 */
export default defineFilter({
    order: -70,
    doFilter: (resolve, reject, complete, { req, res, config }) => {
        const url = req.path;
        if (isRssUpdating() && rssUpdatingApiRegex.getValue().some(r => r.test(url))) {
            return reject({ code: -5, msg: 'Rss is updating.' });
        }
        resolve({ req, res, config });
    }
});