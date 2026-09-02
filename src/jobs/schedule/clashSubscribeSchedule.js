import { subscribeSources } from "#modules/clash/service/clashSubscribeService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * Clash 订阅节点源定期自动更新定时任务
 * 每 12 小时执行一次，从远程源拉取最新的代理节点配置并刷新
 */
export default defineScheduleJob({
    scheduleKey: "clashSubscribe",
    jobName: "Clash Subscribe",
    defaultCron: "0 0 0/12 * * *",
    jobCallback: () => subscribeSources('Schedule')
});