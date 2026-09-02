import { defineSocketChannel } from '#utils/defineUtil.js';
import { getUserByUnameAndPwd } from '#modules/account/service/accountService.js';
import { filterUserRssFavoritesWithUid } from '#modules/account/service/rssFavoritesService.js';
import { storeNotification } from '#modules/notification/service/notificationService.js';
import { getClientsByChannel } from '#modules/socket/wsStorage.js';

const channel = 'rssSubscription';

/**
 * 发布并按用户收藏列表定向推送 RSS 订阅更新通知
 * @param {string} message - JSON 数组字符串 `[{ rssSubsId, torrent, title }]`
 * @param {string} [createBy='Server'] - 发送者
 * @returns {Promise<void>}
 */
export function pushRssSubscription(message, createBy) {
    if (typeof message !== 'string') return Promise.reject();
    createBy = createBy ?? 'Server';
    return new Promise((resolve, reject) => {
        storeNotification({ channel, message, createBy }).then(({ lastId, createTime }) => {
            getClientsByChannel(channel).forEach(client => {
                const user = client.getInfo('user', {});
                if (user?.id > 0) {
                    const jsonArr = Array.from(JSON.parse(message));
                    if (jsonArr.length > 0) {
                        filterUserRssFavoritesWithUid(user.id).then((rows) => {
                            const arr = Array.from(rows).map(r => r.rssSubscribeId);
                            const resArr = [];
                            for (const j of jsonArr) {
                                if (arr.includes(j.rssSubsId)) {
                                    resArr.push(j);
                                }
                            }
                            if (resArr.length > 0) {
                                const msg = JSON.stringify(resArr);
                                client.send({ id: lastId, msg, createTime, createBy });
                            }
                        });
                    }
                }
            });
            resolve();
        }).catch(reject);
    });
}

/**
 * RSS 订阅更新推送 WebSocket 频道 (`/channel/rssSubscription`)
 */
export default defineSocketChannel({
    channel,
    secret: 'mAou5820.rss.subscription',
    printMessage: true,
    validation: (realIp, searchParams) => {
        const uname = searchParams?.get('uname') ?? '';
        const password = searchParams?.get('password') ?? '';
        return !__isAnyBlank(uname, password);
    },
    onConnect: (client, searchParams) => {
        const uname = searchParams?.get('uname') ?? '';
        const password = searchParams?.get('password') ?? '';
        getUserByUnameAndPwd(uname, password).then(user => {
            if (user) {
                client.setInfo('user', user);
                client.send('Welcome.');
            } else {
                client.send('User not found.');
                client.close();
            }
        }).catch(() => {
            client.close();
        });
    },
    onMessage: (data, client) => {
    }
});