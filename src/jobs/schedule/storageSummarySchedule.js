import { storageSummaryDimensions } from "#modules/statistics/service/storageSummaryService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * 对象存储与本地存储占用维度统计汇总定时任务
 * 每天早晨 06:00 触发，汇总各分类的存储容量占用数据并归档入库
 */
export default defineScheduleJob({
    scheduleKey: "storageSummary",
    jobName: "Storage Summary",
    defaultCron: "0 0 6 * * *",
    jobCallback: () => storageSummaryDimensions()
});