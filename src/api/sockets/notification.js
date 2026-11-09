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
                let parsedExtra = ntf.extra;
                if (typeof parsedExtra === 'string') {
                    try {
                        parsedExtra = JSON.parse(parsedExtra);
                    } catch {}
                }
                client.send({
                    id: ntf.id,
                    event: ntf.event || 'message',
                    title: ntf.title || null,
                    message: ntf.message || '',
                    extra: parsedExtra,
                    createTime: ntf.createTime,
                    createBy: ntf.createBy
                });
            });
        }
    });
}

/**
 * 发布并全员广播一条系统通知
 * 支持普通字符串或结构化对象参数：
 * - pushNotification("消息内容", "Sender")
 * - pushNotification({ event: 'kuro-game-sign', title: '签到', message: '完成', extra: { ... } }, "Sender")
 *
 * @param {string|{ event?: string, title?: string, message?: string, extra?: any, createBy?: string }} payload - 通知内容或载荷对象
 * @param {string} [createBy='Server'] - 发送者
 * @returns {Promise<{ lastId: number, createTime: Date }>}
 */
export function pushNotification(payload, createBy) {
    if (!payload) return Promise.reject({ msg: 'Notification payload cannot be empty.' });

    let event = 'message';
    let title = null;
    let message = '';
    let extra = null;
    let finalCreateBy = createBy;

    if (typeof payload === 'string') {
        message = payload;
        finalCreateBy = finalCreateBy ?? 'Server';
    } else if (typeof payload === 'object' && payload !== null) {
        event = payload.event || 'message';
        title = payload.title || null;
        message = payload.message || '';
        extra = payload.extra !== undefined ? payload.extra : null;
        finalCreateBy = payload.createBy || finalCreateBy || 'Server';
    } else {
        return Promise.reject({ msg: 'Invalid payload type: string or object expected.' });
    }

    return new Promise((resolve, reject) => {
        storeNotification({
            channel,
            event,
            title,
            message,
            extra,
            createBy: finalCreateBy
        }).then(({ lastId, createTime }) => {
            const broadcastData = {
                id: lastId,
                event,
                title,
                message,
                extra,
                createTime,
                createBy: finalCreateBy
            };
            getClientsByChannel(channel).forEach(client => client.send(broadcastData));
            resolve({ lastId, createTime });
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