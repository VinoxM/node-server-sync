import { defineScheduleJob } from '#utils/defineUtil.js';
import { autoUpdateSubscribe } from '#modules/anime/service/rss/rssScheduleService.js';

/**
 * RSS 追番订阅源自动抓取、种子匹配与下载任务分发定时任务
 * 每小时 56 分 20 秒执行一次，支持失败 3 次重试 (每次间隔 3 秒)
 * 执行流程：
 * 1. 抓取未完结订阅源更新，计算新发布的资源项
 * 2. 拼接最优 Tracker 服务器列表生成磁力/种子链接
 * 3. 触发系统通知与 WebSocket 广播
 * 4. 自动匹配收藏规则并下发 Aria2/下载器后台任务
 */
export default defineScheduleJob({
    scheduleKey: "rssSubscribe",
    jobName: "RSS Subscribe",
    defaultCron: "20 56 * * * *",
    retry: {
        maxCount: 3,
        interval: 3 * 1000
    },
    immediate: false,
    jobCallback: () => autoUpdateSubscribe()
});