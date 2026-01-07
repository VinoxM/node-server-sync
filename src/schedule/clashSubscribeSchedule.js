import { updateClashSubInfo } from '../handler/clashHandler.js';

export default {
    scheduleKey: "clashSubscribe",
    jobName: "Clash Subscribe",
    defaultCorn: "0 0 0/12 * * *",
    jobCallback: () => updateClashSubInfo('Schedule')
}