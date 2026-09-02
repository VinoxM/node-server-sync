import { ipBlocker } from "#core/instance/ipBlocker.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * IP 拦截器过期缓存与封禁记录清理定时任务
 * 每 5 分钟执行一次，清理超出时间窗口的正常统计与已解封的 IP 记录（静默执行）
 */
export default defineScheduleJob({
    scheduleKey: "ipBlockerClean",
    jobName: "Ip Blocker Clean",
    defaultCron: "0 0/5 * * * *",
    ignoreOutput: true,
    jobCallback: () => ipBlocker.clean()
});