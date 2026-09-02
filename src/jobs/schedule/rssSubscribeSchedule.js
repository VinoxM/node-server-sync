import rssRep from '#modules/rss/repository/rssRep.js';
import rssTrackerRep from '#modules/rss/repository/rssTrackerRep.js';
import { pushNotification } from '#api/sockets/notification.js';
import { pushRssSubscription } from '#api/sockets/rssSubscription.js';
import { concatTrackers } from '#modules/rss/service/rssTrackerService.js';
import { addRssTasksFromFavorites } from '#modules/rss/service/rssTaskService.js';
import { updateRssSubscribe } from '#modules/rss/service/rssSubscribeService.js';
import { defineScheduleJob } from '#utils/defineUtil.js';

const { selectRssSubscribeCountsWithoutFin, selectRssSubscribeByIdWithLimited } = rssRep;
const { selectAll } = rssTrackerRep;

/**
 * RSS 追番订阅源自动抓取、种子匹配与下载任务分发定时任务
 * 每小时 56 分 20 秒执行一次，支持失败 3 次重试 (每次间隔 3 秒)
 * 执行流程：
 * 1. 抓取未完结订阅源更新，计算新发布的资源项
 * 2. 拼接最优 Tracker 服务器列表生成磁力/种子链接
 * 3. 触发系统通知与 WebSocket 广播
 * 4. 自动匹配收藏规则并下发 Aria2/下载器后台任务
 */
export default defineScheduleJob({
    scheduleKey: "rssSubscribe",
    jobName: "RSS Subscribe",
    defaultCron: "20 56 * * * *",
    retry: {
        maxCount: 3,
        interval: 3 * 1000
    },
    immediate: false,
    jobCallback: async () => {
        let beforeUpdate = [];
        let afterUpdate = [];
        return selectRssSubscribeCountsWithoutFin()
            .then(res => {
                beforeUpdate = [...res.data];
                return res.data.map(o => o.id);
            })
            .then(updateRssSubscribe)
            .then(async res => {
                const { effectRows } = res;
                __log.debug(`[RssSubscribe Schedule] effect rows: ${effectRows}`);
                if (effectRows > 0) {
                    await selectRssSubscribeCountsWithoutFin().then(r => (afterUpdate = r.data));
                    const updated = [];
                    afterUpdate.forEach(obj => {
                        beforeUpdate.some(b => {
                            if (b.id === obj.id) {
                                obj.counts - b.counts > 0 && updated.push({ id: obj.id, name: obj.name, count: obj.counts - b.counts });
                                return true;
                            }
                            return false;
                        });
                    });
                    if (updated.length === 0) return;
                    const trackers = await selectAll().then(({ data }) => {
                        const result = {};
                        Array.from(data).forEach(item => {
                            result[item.id] = item.host;
                        });
                        return result;
                    });
                    Promise.all(updated.map(o => {
                        const { id, ...resObj } = o;
                        return selectRssSubscribeByIdWithLimited(id, o.count).then(r => {
                            if (__isNotEmptyArray(r.data)) {
                                resObj.id = id;
                                resObj.cover = r.data[0]?.cover || '';
                                resObj.result = Array.from(r.data).map(obj => ({
                                    resultId: obj.rid,
                                    title: obj.title,
                                    torrent: concatTrackers(obj.torrent, obj.tracker, trackers)
                                }));
                            }
                            return resObj;
                        });
                    })).then(r => {
                        pushToNotification({ ...res, updated: r });
                        const rssSubsArr = smoothArray(r);
                        pushToRssSubscription(rssSubsArr);
                        addRssTasksFromFavorites(rssSubsArr);
                    });
                }
            }).catch(e => {
                __log.info(e);
            });
    }
});

/**
 * 推送 RSS 更新通知至 WebSocket
 * @param {Record<string, any>} data - 载荷数据
 */
function pushToNotification(data) {
    pushNotification(JSON.stringify({ event: 'RSS Subscribe', ...data }), 'Server');
}

/**
 * 展平并提取订阅任务列表
 * @param {Array<{ id: number, result?: Array<any> }>} data - 原始更新结果
 * @returns {Array<any>} 展平后的任务项数组
 */
function smoothArray(data) {
    const resultArr = [];
    const arr = Array.from(data);
    for (const { id, result } of arr) {
        Array.from(result || []).forEach(tObj => {
            resultArr.push({
                rssSubsId: id,
                ...tObj
            });
        });
    }
    return resultArr;
}

/**
 * 广播 RSS 订阅事件给已连接的 WebSocket 客户端
 * @param {Array<any>} rssSubsArr - 订阅任务项
 */
function pushToRssSubscription(rssSubsArr) {
    if (rssSubsArr.length > 0) {
        pushRssSubscription(JSON.stringify(rssSubsArr), 'Server');
    }
}