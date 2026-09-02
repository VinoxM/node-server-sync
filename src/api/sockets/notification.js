import { defineSocketChannel } from '#utils/defineUtil.js';
import { getNotification, storeNotification } from '#modules/notification/service/notificationService.js';
import { getClientsByChannel } from '#modules/socket/wsStorage.js';

const channel = 'notification';

/**
 * 按 lastId 游标拉取并向客户端发送最近的历史通知列表
 * @param {import('#core/infra/socketClient.js').SocketClient} client - 目标客户端
 * @param {number} lastId - 起始游标
 */
function sendNotificationByLastId(client, lastId) {
    getNotification(channel, lastId, 10).then(notifyList => {
        if (Array.isArray(notifyList) && notifyList.length > 0) {
            notifyList.forEach(ntf => {
                const { extra, ...obj } = ntf;
                client.send(obj);
            });
        }
    });
}

/**
 * 发布并全员广播一条系统通知
 * @param {string} message - 通知内容
 * @param {string} [createBy='Server'] - 发送者
 * @returns {Promise<void>}
 */
export function pushNotification(message, createBy) {
    if (typeof message !== 'string') return Promise.reject();
    createBy = createBy ?? 'Server';
    return new Promise((resolve, reject) => {
        storeNotification({ channel, message, createBy }).then(({ lastId, createTime }) => {
            getClientsByChannel(channel).forEach(client => client.send({ id: lastId, message, createTime, createBy }));
            resolve();
        }).catch(reject);
    });
}

/**
 * 全局系统通知 WebSocket 频道 (`/channel/notification`)
 */
export default defineSocketChannel({
    channel,
    secret: 'mAou5820.notification',
    printMessage: true,
    onConnect: (client, searchParams) => {
        client.send('Welcome.');
        const lastId = parseInt(searchParams.get('lastId') ?? '0') || 0;
        sendNotificationByLastId(client, lastId);
    },
    onMessage: (data, client) => {
        // 收到客户端消息处理逻辑
    }
});