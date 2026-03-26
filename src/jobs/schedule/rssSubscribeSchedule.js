import rssRep from '../../modules/rss/repository/rssRep.js';
import rssTrackerRep from '../../modules/rss/repository/rssTrackerRep.js';
import { pushNotification } from '../../api/sockets/notification.js';
import { pushRssSubscription } from '../../api/sockets/rssSubscription.js';
import { concatTrackers } from '../../modules/rss/service/rssTrackerService.js';
import { addRssTasksFromFavorites } from '../../modules/rss/service/rssTaskService.js';

const { selectRssSubscribeCountsWithoutFin, selectRssSubscribeByIdWithLimited } = rssRep;
const { selectAll } = rssTrackerRep;

export default {
    scheduleKey: "rssSubscribe",
    jobName: "RSS Subscribe",
    defaultCorn: "20 56 * * * *",
    retry: {
        maxCount: 3,
        interval: 3 * 1000
    },
    immediate: false,
    jobCallback: () => {
        let beforeUpdate = []
        let afterUpdate = []
        return selectRssSubscribeCountsWithoutFin().then(res => (beforeUpdate = [...res.data], res.data.map(o => o.id))).then(updateRssSubscribe).then(async res => {
            const { effectRows } = res
            __log.debug(`[RssSubscribe Schedule] effect rows: ${effectRows}`)
            if (effectRows > 0) {
                await selectRssSubscribeCountsWithoutFin().then(r => afterUpdate = r.data)
                const updated = []
                afterUpdate.forEach(obj => {
                    beforeUpdate.some(b => {
                        if (b.id === obj.id) {
                            obj.counts - b.counts > 0 && updated.push({ id: obj.id, name: obj.name, count: obj.counts - b.counts })
                            return true
                        }
                        return false
                    })
                })
                if (updated.length === 0) return;
                const trackers = await selectAll().then(({ data }) => {
                    const result = {};
                    Array.from(data).forEach(item => {
                        result[item.id] = item.host;
                    })
                    return result;
                });
                Promise.all(updated.map(o => {
                    const { id, ...resObj } = o
                    return selectRssSubscribeByIdWithLimited(id, o.count).then(r => {
                        if (__isNotEmptyArray(r.data)) {
                            resObj.id = id
                            resObj.cover = r.data[0]?.cover || ''
                            resObj.result = Array.from(r.data).map(obj => ({
                                resultId: obj.rid,
                                title: obj.title,
                                torrent: concatTrackers(obj.torrent, obj.tracker, trackers)
                            }))
                        }
                        return resObj
                    })
                })).then(r => {
                    pushToNotification({ ...res, updated: r })
                    const rssSubsArr = smoothArray(r)
                    pushToRssSubscription(rssSubsArr)
                    addRssTasksFromFavorites(rssSubsArr)
                })
            }
        }).catch(e => {
            __log.info(e)
        })
    }
}

function pushToNotification(data) {
    pushNotification(JSON.stringify({ event: 'RSS Subscribe', ...data }), 'Server')
}

function smoothArray(data) {
    const resultArr = []
    const arr = Array.from(data)
    for (const { id, result } of arr) {
        Array.from(result).forEach(tObj => {
            resultArr.push({
                rssSubsId: id,
                ...tObj
            })
        })
    }
    return resultArr
}

function pushToRssSubscription(rssSubsArr) {
    if (rssSubsArr.length > 0) {
        pushRssSubscription(JSON.stringify(rssSubsArr), 'Server')
    }
}