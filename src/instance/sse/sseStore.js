import { SSEClient } from './sseClient.js'

export class SSEStore {
    #clients = {}
    #channelConfigs = null

    constructor() {
    }

    initialize(channelConfigs = {}) {
        this.#channelConfigs = channelConfigs
    }

    #verifyChannel(req) {
        const channel = req.query.channel
        if (isNotBlank(channel) && (this.#channelConfigs[channel]?.validator?.(req, this.#clients) ?? false)) {
            return this.#channelConfigs[channel]
        }
        return null
    }

    store(req, res) {
        const clients = this.#clients
        const channelConf = this.#verifyChannel(req)
        const channel = req.query.channel
        if (channelConf !== null) {
            const client = new SSEClient(req, res, channelConf)
            const uname = client.getUname()
            client.setupOnClosed(() => {
                const index = clients[channel].indexOf(client)
                clients[channel]?.splice(index, 1)
                __log.info(`[SSE] Client closed. -x-> ${channel}:${uname}`)
            })
            if (!clients[channel]) {
                clients[channel] = []
            }
            clients[channel].push(client)
            __log.info(`[SSE] Client connected. <== ${channel}:${uname}`)
        } else {
            __log.error('[SSE] Channel invalid, refuse sse request.')
            res.end('Channel invalid.')
        }
    }

    broadcast(channel, event, message) {
        const channels = this.#clients[channel]
        if (channels) {
            Array.from(channels).forEach(client => {
                client?.emitEvent?.(event, message)
            })
        }
    }
}