import { autoSyncStreams } from "#modules/media/service/bilive/biliveStreamService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * B站 (Bilibili) 直播流转存与录制任务同步定时任务
 * 每天凌晨 04:00 执行一次，同步直播间推流状态与录制任务进度
 */
export default defineScheduleJob({
    scheduleKey: "biliveStreamAutoSync",
    jobName: "Bilive Stream Auto Sync",
    defaultCron: "0 0 4 * * *",
    jobCallback: () => autoSyncStreams()
});