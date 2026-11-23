import { cleanExpiredChangelog } from "#modules/magicBook/service/syncService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * Magic Book 增量同步流水历史数据修剪定时任务
 * 每天凌晨 3:00 执行一次，自动清理保留 7 天之前的变更流水
 */
export default defineScheduleJob({
    scheduleKey: "magicBookChangelogClean",
    jobName: "Magic Book Changelog Clean",
    defaultCron: "0 0 3 * * *",
    ignoreOutput: true,
    jobCallback: () => cleanExpiredChangelog(7)
});
