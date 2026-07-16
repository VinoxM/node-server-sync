import { autoSyncStreams } from "../../modules/media/service/bilive/biliveStreamService.js";

export default {
    scheduleKey: "biliveStreamAutoSync",
    jobName: "Bilive Stream Auto Sync",
    defaultCorn: "0 0 4 * * *",
    jobCallback: () => autoSyncStreams()
}