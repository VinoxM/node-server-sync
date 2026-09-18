import { SUBJECT_NSFW_VALUE, SUBJECT_PLATFORM_DEFAULT, SUBJECT_PLATFORM_IS_SHORT } from "#modules/anime/constants/subjectConstant.js";

/**
 * 格式化番剧数据为日历紧凑视图结构
 * @param {Array<any>} data - 原始番剧列表
 * @param {UserInfo} [userInfo] - 用户信息（未登录时过滤 NSFW 内容）
 * @returns {Array<import('#types/animeTypes.d.ts').AnimeCalendarItem>}
 */
export function handleCalendar(data, userInfo) {
    let list = userInfo ? data : data.filter(o => o.nsfw === SUBJECT_NSFW_VALUE.NO);
    let now = new Date();
    const nowTimestamp = now.getTime();
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }
    return list.map(obj => {
        const { startTime } = obj;
        let date = new Date(startTime);
        if (startTime === 0 || startTime === null || startTime === undefined) {
            date = new Date(obj.season + '-01');
        }
        let startDate = `${date.getFullYear()}${(date.getMonth() + 1 + '').padStart(2, '0')}${(date.getDate() + '').padStart(2, '0')}`;
        let hours = date.getHours();
        let minutes = date.getMinutes();
        if (hours >= 0 && hours < 6) {
            date.setDate(date.getDate() - 1);
            hours += 24;
        }
        let updateTime = `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;
        const isTV = obj.platform === SUBJECT_PLATFORM_DEFAULT || JSON.parse(obj.metaTags || '[]').includes?.(SUBJECT_PLATFORM_DEFAULT);
        const isShort = obj.platform === SUBJECT_PLATFORM_IS_SHORT;
        let type = `${isShort ? 1 : 0}${(isTV || isShort) ? 0 : 1}`;
        let status = now.getTime() - date.getTime() < 0 ? 0 : (obj.fin === 0 ? 1 : 2);
        const lastPubDatetime = new Date(obj.lastPub).getTime();
        const hasNew = obj.lastPub && (nowTimestamp - lastPubDatetime < 24 * 60 * 60 * 1000) ? 1 : 0;
        const result = {
            Z: obj.nameCN, // name
            J: obj.name, // nameJP
            D: startDate + updateTime + date.getDay(), // startDate. ep: '2024010210000'
            C: obj.cover, // cover
            T: type, // type. isShort(0/1) concat isWeb(0/1)
            S: status, // status. enum: 0-not start/1-broadcasting/2-fin
            E: (obj.latestEp || '') + ':' + obj.totalEpisodes || 0, // lastEp
            N: hasNew, // hasNew. enum: 0, 1
            U: obj.id + ":" + obj.subsId, // id
            R: obj.count, // epCount
            G: obj.goon, // goon
            A: obj.totalEpisodes,
            P: lastPubDatetime,
            F: isShort ? SUBJECT_PLATFORM_DEFAULT : obj.platform,
            B: Boolean(obj.nsfw)
        };
        if (obj.similarity) {
            result.M = obj.similarity;
        }
        return result;
    });
}