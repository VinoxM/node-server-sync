import { getRequestRealIp } from '../../common/httpUtil.js'
import { ContextSubscribe } from '../../context/subscribe.js'

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
        if (isFunction(this.#onConnected)) {
            this.#onConnected(this)
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
        const msgArr = resolveMessage(message)
        for (const msg of msgArr) {
            this.#response?.write(msg)
        }
    }

    emitEvent(event, message) {
        this.#response?.write(`event: ${event}\n`)
        const msgArr = resolveMessage(message)
        for (const msg of msgArr) {
            this.#response?.write(msg)
        }
    }

    close() {
        this.destroy()
        this.#clearKeepalive()
        try {
            this.#response?.end?.()
            if (isFunction(this.#onClosed)) {
                this.#onClosed()
            }
            if (isFunction(this.#onDisconnected)) {
                this.#onDisconnected()
            }
        } catch (ignored) {
            __log.error(ignored)
        }
    }
}

function resolveMessage(message) {
    let str = ''
    if (typeof message === 'string') {
        str = message
    } else if (typeof message === 'object') {
        str = JSON.stringify(message)
    }
    if (str === '') {
        return ['data: \n\n']
    }
    str = encodeURIComponent(str)
    str = Buffer.from(str, 'utf-8').toString('base64')
    let result = []
    const splitLen = 500
    const num = Math.ceil(str.length / splitLen)
    for (let i = 0; i < num; i++) {
        result.push(str.substring(i * splitLen, Math.min(str.length, (i + 1) * splitLen)))
    }
    return result.map((s, i) => `data: ${s}\n${num - i === 1 ? '\n' : ''}`)
}