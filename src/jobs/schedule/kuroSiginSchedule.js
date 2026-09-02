import { pushNotification } from "#api/sockets/notification.js";
import { kuroGameSignAll } from "#modules/kuro/service/kuroService.js";
import { defineScheduleJob } from "#utils/defineUtil.js";

/**
 * 库洛游戏 (Kuro Game) 鸣潮/战双每日全员自动签到定时任务
 * 每天凌晨 00:00:05 触发，自动为所有已绑定 Token 的账户执行签到并将结果推送到 WebSocket 通知
 */
export default defineScheduleJob({
    scheduleKey: "kuroGameSign",
    jobName: "Kuro Game Sign",
    defaultCron: "5 0 0 * * *",
    jobCallback: () => kuroGameSignAll().then(data => {
        const { handleCount, errorCount } = data;
        __log.info(`[Kuro MC Sign] 签到成功${handleCount - errorCount}个, 失败${errorCount}个`);
        pushNotification(JSON.stringify({ event: 'Kuro MC Sign', ...data }), 'Schedule');
    })
});