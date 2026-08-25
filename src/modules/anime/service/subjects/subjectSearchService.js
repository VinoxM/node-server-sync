import { getCurSeason } from "../../../../common/utils/dateUtil.js";
import subjectsRep from "../../repository/subjectsRep.js";

function handleSearch(data) {
    let list = Array.from(data);
    let now = new Date();
    if (now.getHours() < 6) {
        now.setDate(now.getDate() - 1);
    }
    return list.map(obj => {
        const { startTime } = obj;
        let date = new Date(startTime);
        let startDate = `${date.getFullYear()}${(date.getMonth() + 1 + '').padStart(2, '0')}${(date.getDate() + '').padStart(2, '0')}`;
        let hours = date.getHours();
        let minutes = date.getMinutes();
        if (hours >= 0 && hours < 6) {
            date.setDate(date.getDate() - 1);
            hours += 24;
        }
        let updateTime = `${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}`;        
        const isTV = obj.platform === 'TV' || JSON.parse(obj.metaTags || '[]').includes?.('TV');
        let type = `${obj.isShort ?? 0}${isTV ? 0 : 1}`;
        let status = now.getTime() - date.getTime() < 0 ? 0 : (obj.fin === 0 ? 1 : 2);
        return {
            Z: obj.nameCN, // name
            J: obj.name, // nameJP
            D: startDate + updateTime + date.getDay(), // startDate. ep: '2024010210000'
            C: obj.cover, // cover
            T: type, // type. isShort(0/1) concat isWeb(0/1)
            S: status, // status. enum: 0-not start/1-broadcasting/2-fin
            E: obj.latestEp, // lastEp
            N: obj.hasNew, // hasNew. enum: 0, 1
            U: obj.id, // id
            R: obj.count, // epCount
            G: obj.goon, // goon
        }
    })
}


export async function getAnimeCalendar() {
    const season = getCurSeason();
    const { rows, data } = await subjectsRep.selectVisibleBySeason(season.join('-'));
    return handleSearch(data);
}