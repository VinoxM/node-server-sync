import notificationRep from '../../repository/socket/notificationRep.js';

export function storeNotification(data) {
    const { message } = data;
    if (!message || typeof message !== 'string' || message.trim().length === 0) return Promise.reject({msg: 'Invalid message.'});
    return notificationRep.insertNotification(data);
}

export function getNotification(channel, lastId, limit) {
    return notificationRep.selectNotification({ channel, lastId }, limit).then(res => res.data);
}