import { backfillEmptyNameVector } from "#modules/rss/service/rssSubscribeService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * RSS 订阅番剧名称语义向量批量计算与回填定时任务
 * 每天早晨 06:00 触发，为缺失向量特征的番剧名称生成 1024 维 Embedding 并同步至 Qdrant 向量库
 */
export default defineScheduleJob({
    scheduleKey: "rssSubscribeVector",
    jobName: "Rss Subscribe Vector Backfill",
    defaultCron: "0 0 6 * * *",
    jobCallback: () => backfillEmptyNameVector()
});