import { subscribeSources } from "../../modules/clash/service/clashSubscribeService.js";

export default {
    scheduleKey: "clashSubscribe",
    jobName: "Clash Subscribe",
    defaultCorn: "0 0 0/12 * * *",
    jobCallback: () => subscribeSources('Schedule')
}