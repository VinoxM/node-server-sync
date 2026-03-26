import { pushNotification } from "../../api/sockets/notification.js";
import { kuroGameSignAll } from "../../modules/kuro/service/kuroService.js";

export default {
    scheduleKey: "kuroGameSign",
    jobName: "Kuro Game Sign",
    defaultCorn: "5 0 0 * * *",
    jobCallback: () => kuroGameSignAll().then(data => {
        const { handleCount, errorCount } = data;
        __log.info(`[Kuro MC Sign] 签到成功${handleCount - errorCount}个, 失败${errorCount}个`);
        pushNotification(JSON.stringify({ event: 'Kuro MC Sign', ...data }), 'Schedule');
    })
}