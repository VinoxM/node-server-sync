import { flushHanime1 } from "#modules/media/service/crawl/hanime1/index.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * 定时爬虫服务
 */
export default defineScheduleJob({
    scheduleKey: "mediaCrawl",
    jobName: "Media Crawl",
    defaultCron: "0 14 0/2 * * *",
    ignoreOutput: true,
    jobCallback: async () => {
        await flushHanime1();
    }
});