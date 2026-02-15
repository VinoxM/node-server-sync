import { subscribeSources } from '../handler/clash/clashSubscribeHandler.js';

export default {
    scheduleKey: "clashSubscribe",
    jobName: "Clash Subscribe",
    defaultCorn: "0 0 0/12 * * *",
    jobCallback: () => subscribeSources('Schedule')
}