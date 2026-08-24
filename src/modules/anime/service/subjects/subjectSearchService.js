import { getCurSeason } from "../../../../common/utils/dateUtil.js";
import subjectsRep from "../../repository/subjectsRep.js";

export async function getAnimeCalendar() {
    const season = getCurSeason();
    const { rows, data } = await subjectsRep.selectVisibleBySeason(season.join('-'));
    return data;
}