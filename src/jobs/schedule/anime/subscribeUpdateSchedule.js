import { defineScheduleJob } from '#utils/defineUtil.js';
import { autoUpdateSubscribe } from '#modules/anime/service/rss/rssScheduleService.js';

export default defineScheduleJob({
    scheduleKey: "subscribeUpdate",
    jobName: "RSS Subscribe Update",
    defaultCron: "0 7/30 * * * *",
    retry: {
        maxCount: 3,
        interval: 3 * 1000
    },
    immediate: false,
    jobCallback: () => autoUpdateSubscribe()
});