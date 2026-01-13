import { Transmission } from '@ctrl/transmission'
import { ContextSubcribe } from '../../context/subscribe.js'
import downloadConst from '../../constraints/downloadConst.js'
import { join } from 'path'

class SubscriptionRPC extends ContextSubcribe {
    static instance = new SubscriptionRPC()

    #client = null
    constructor() { 
        super('TransissionRPC')
    }

    initialize(force = false) {
        if (this.#client === null || force) {
            const options = __env.get('torrent.transmission', {
                baseUrl: downloadConst.TRANSMISSION_BASE_URL,
                username: downloadConst.TRANSMISSION_UNAME,
                password: downloadConst.TRANSMISSION_PASSWORD,
            })
            this.#client = new Transmission(options)
        }
    }

    async addTorrent(torrent, savePath) {
        this.initialize()
        try {
            console.log('正在尝试添加任务...');
            const newTorrent = await this.#client.addTorrent(torrent, {
                "download-dir": savePath
            });
            console.log(`✅ 任务已添加: ${newTorrent.name}`);
            console.log(`ID: ${newTorrent.id}`);
        } catch (err) {
            console.error('❌ 出错了:', err);
        }
    }

    onRefresh() {
        this.initialize(true)
    }
}

export async function addTorrent(torrents, savePath = 'Anime') {
    if (!Array.isArray(torrents)) torrents = [torrents]
    const dir = join('/shared_media/Downloads', savePath)
    return Promise.all(torrents.map(torrent => SubscriptionRPC.instance.addTorrent(torrent, dir)))
}