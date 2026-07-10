import { backfillEmptyNameVector } from "../../modules/rss/service/rssSubscribeService.js";

export default {
    scheduleKey: "rssSubscribeVector",
    jobName: "Rss Subscribe Vector Backfill",
    defaultCorn: "0 0 6 * * *",
    jobCallback: () => backfillEmptyNameVector()
}