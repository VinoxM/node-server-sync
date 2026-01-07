import { storeNotification } from "../handler/socket/notificationHandler.js";
import { getClientsByChannel } from "../handler/socket/socketHandler.js";
import authRep from "../repository/account/authRep.js";
import rssFavoritesRep from "../repository/account/rssFavoritesRep.js";

const channel = 'rssSubscription';

export function pushRssSubscription(message, createBy) {
    if (typeof message !== 'string') return Promise.reject();
    createBy = createBy ?? 'Server';
    return new Promise((resolve, reject) => {
        storeNotification({ channel, message, createBy }).then(({ lastId, createTime }) => {
            getClientsByChannel(channel).forEach(client => {
                const user = client.getInfo('user', {})
                if (user.id > 0) {
                    /**
                     * [{
                     *  rssSubsId: '',
                     *  torrent: '',
                     *  title: ''
                     * }]
                     */
                    const jsonArr = Array.from(JSON.parse(message))
                    if (jsonArr.length > 0) {
                        rssFavoritesRep.selectUserFavorites(user.id).then((rows) => {
                            const arr = Array.from(rows).map(r => r.rssSubscribeId)
                            const resArr = []
                            for (const j of jsonArr) {
                                if (arr.includes(j.rssSubsId)) {
                                    resArr.push(j)
                                }
                            }
                            if (resArr.length > 0) {
                                const msg = JSON.stringify(resArr)
                                client.send({ id: lastId, msg, createTime, createBy })
                            }
                        })
                    }
                }
            });
            resolve();
        }).catch(reject);
    })
}

export default {
    channel,
    secret: 'mAou5820.rss.subscription',
    printMessage: true,
    validation: (realIp, searchParams) => {
        const uname = searchParams?.get('uname') ?? ''
        const password = searchParams?.get('password') ?? ''
        return isNotBlank(uname) && isNotBlank(password)
    },
    onConnect: (client, searchParams) => {
        const uname = searchParams?.get('uname') ?? ''
        const password = searchParams?.get('password') ?? ''
        authRep.selectByUnameAndPassword(uname, password).then(user => {
            if (user) {
                client.setInfo('user', user);
                client.send('Welcome.');
            } else {
                client.send('User not found.');
                client.close()
            }
        }).catch(() => {
            client.close()
        })
    },
    onMessage: (data, client) => {
    }
}