import { getClientsByChannel } from '../handler/socket/socketHandler.js';
import { getNotification, storeNotification } from "../handler/socket/notificationHandler.js";

const channel = 'notification';

function sendNotificationByLastId(client, lastId) {
    getNotification(channel, lastId, 10).then(notifyList => {
        if (Array.isArray(notifyList) && notifyList.length > 0) {
            notifyList.forEach(ntf => {
                const { extra, ...obj } = ntf;
                client.send(obj)
            })
        }
    })
}

export function pushNotification(message, createBy) {
    if (typeof message !== 'string') return Promise.reject();
    createBy = createBy ?? 'Server';
    return new Promise((resolve, reject) => {
        storeNotification({ channel, message, createBy }).then(({ lastId, createTime }) => {
            getClientsByChannel(channel).forEach(client => client.send({ id: lastId, message, createTime, createBy }));
            resolve();
        }).catch(reject);
    })
}

export default {
    channel,
    secret: 'mAou5820.notification',
    printMessage: true,
    onConnect: (client, searchParams) => {
        client.send('Welcome.');
        const lastId = searchParams.get('lastId') || 0;
        sendNotificationByLastId(client, lastId);
    },
    onMessage: (data, client) => {
        // __log.info(`[Socket] notification -> ${data}`);
    }
}