import { importFolderScripts } from "../../common/utils/importUtil.js"
import { SSEClient } from "../../core/infra/sseClient.js"

class SSEStore {
    static instance = new SSEStore()

    #clients = {}
    #channelConfigs = null

    constructor() {
    }

    initialize(channelConfigs = {}) {
        this.#channelConfigs = channelConfigs
    }

    #verifyChannel(req) {
        const channel = req.query.channel
        if (__isNotBlank(channel) && (this.#channelConfigs[channel]?.validator?.(req, this.#clients) ?? false)) {
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

    broadcast(channel, event, message, opts) {
        const channels = this.#clients[channel]
        if (channels) {
            Array.from(channels).forEach(client => {
                client?.emitEvent?.(event, message, opts)
            })
        }
    }
}

export function storeSSE(req, res) {
    SSEStore.instance.store(req, res)
}

export function broadcastSSE(channel, event, message, opts) {
    SSEStore.instance.broadcast(channel, event, message, opts)
}

export async function sseInitialize() {
    const disabledSSE = Array.from(__env.get("sse.disabled", []))
    const configs = {}
    return importFolderScripts("@/src/api/sse", true, (module, name) => {
        if (disabledSSE.includes(name)) return
        const channelConf = module.default
        const { channel, validator, ...ops } = channelConf
        if (__isNotBlank(channel) && __isFunction(validator) && !(channel in configs)) {
            configs[channel] = { channel, validator, ...ops }
            __log.info(`[SSE] Loaded sse configuration: ${channel}`)
        }
    }).then(() => SSEStore.instance.initialize(configs))
}