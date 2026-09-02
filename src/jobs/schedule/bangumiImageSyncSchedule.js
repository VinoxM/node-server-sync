import { pushImageToStorageSchedule } from "#modules/anime/service/bangumi/bangumiImagesService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * Bangumi 番组封面图片同步转存定时任务
 * 每 3 小时执行一次，扫描待同步番组封面并上传至 MinIO 对象存储
 */
export default defineScheduleJob({
    scheduleKey: "bangumiImagesSync",
    jobName: "Bangumi Images Sync",
    defaultCron: "0 0 0/3 * * *",
    jobCallback: () => pushImageToStorageSchedule()
});