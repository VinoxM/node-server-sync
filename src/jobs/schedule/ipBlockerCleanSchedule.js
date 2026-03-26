import { ipBlocker } from "../../core/instance/ipBlocker.js";

export default {
    scheduleKey: "ipBlockerClean",
    jobName: "Ip Blocker Clean",
    defaultCorn: "0 0/5 * * * *",
    ignoreOutput: true,
    jobCallback: () => ipBlocker.clean()
}