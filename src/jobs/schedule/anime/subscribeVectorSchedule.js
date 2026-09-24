import { backfillSubscribeVectorSchedule } from "#modules/anime/service/subject/subjectScheduleService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * RSS 订阅番剧名称语义向量批量计算与回填定时任务
 * 每天早晨 06:00 触发，为缺失向量特征的番剧名称生成 1024 维 Embedding 并同步至 Qdrant 向量库
 */
export default defineScheduleJob({
    scheduleKey: "subscribeVector",
    jobName: "Subscribe Vector Backfill",
    defaultCron: "0 0 6 * * *",
    abortable: true,
    jobCallback: async (signal) => backfillSubscribeVectorSchedule(signal)
});