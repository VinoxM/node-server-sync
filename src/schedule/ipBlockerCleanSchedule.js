import { cleanBlocker } from "../common/apiIpBlock.js";

export default {
    scheduleKey: "ipBlockerClean",
    jobName: "Ip Blocker Clean",
    defaultCorn: "0 0/5 * * * *",
    ignoreOutput: true,
    jobCallback: cleanBlocker
}