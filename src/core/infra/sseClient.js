import { getRequestRealIp, resolveStreamMessage } from '../../common/utils/requestUtil.js'
import { ContextSubscribe } from '../context/subscribe.js'

export class SSEClient extends ContextSubscribe {
    #realIp
    #uname
    #request
    #response
    #onClosed = null
    #keepalive = null
    #onConnected = null
    #onDisconnected = null

    constructor(request, response, options = {}) {
        const {
            channel,
            onConnected = null,
            onConfigurationRefreshed = null,
            onDisconnected = null
        } = options
        super(channel, () => onConfigurationRefreshed?.(this))
        this.#request = request
        this.#response = response
        this.#onConnected = onConnected
        this.#onDisconnected = onDisconnected
        this.#initialize()
    }

    #initialize() {
        this.#realIp = getRequestRealIp(this.#request)
        this.#uname = this.#request.query?.uname ?? 'default'
        this.#response?.setHeader('Content-Type', 'text/event-stream')
        this.#response?.setHeader('Cache-Control', 'no-cache')
        this.#response?.setHeader('Connection', 'keep-alive')
        this.#response?.setHeader('Access-Control-Allow-Origin', '*')
        this.#setupKeepalive()
        this.#request?.on?.('close', () => {
            this.close()
        })
        this.emitEvent('connect', '')
        if (__isFunction(this.#onConnected)) {
            this.#onConnected(this, this.#request.query)
        }
    }

    #setupKeepalive() {
        this.#clearKeepalive()
        this.#keepalive = setInterval(() => {
            this.#response?.write(': keep-alive\n\n')
        }, 30000)
    }

    #clearKeepalive() {
        if (this.#keepalive !== null) {
            clearInterval(this.#keepalive)
            this.#keepalive = null
        }
    }

    getRealIp() {
        return this.#realIp
    }

    getUname() {
        return this.#uname
    }

    setupOnClosed(func) {
        this.#onClosed = func
    }

    sendMessage(message) {
        const msgArr = resolveStreamMessage(message)
        for (const msg of msgArr) {
            this.#response?.write(msg)
        }
    }

    emitEvent(event, message) {
        this.#response?.write(`event: ${event}\n`)
        const msgArr = resolveStreamMessage(message)
        for (const msg of msgArr) {
            this.#response?.write(msg)
        }
    }

    close() {
        this.destroy()
        this.#clearKeepalive()
        try {
            this.#response?.end?.()
            if (__isFunction(this.#onClosed)) {
                this.#onClosed()
            }
            if (__isFunction(this.#onDisconnected)) {
                this.#onDisconnected()
            }
        } catch (ignored) {
            __log.error(ignored)
        }
    }
}