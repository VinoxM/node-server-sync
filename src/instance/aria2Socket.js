import WebSocket from 'ws'
import axios from 'axios'
import path from 'path'
import { ContextSubcribe } from '../context/subscribe.js'
import { generateUUID } from '../common/stringUtil.js'

const ARIA2_METHOD = {
    ADD_URI: "aria2.addUri",
    TELL_STATUS: 'aria2.tellStatus'
}

class Aria2Socket extends ContextSubcribe {

    static instance = new Aria2Socket()

    #initialized = false

    #ready = false
    #client = null
    #secret = null
    #savePath = null

    #urlPath = null

    #nextConnectDelay = 5
    #maxConnectDelay = 1024
    #connectTimeout = null

    #taskCallback = new Map()

    constructor() {
        super('Aria2Socket', () => this.start(), true)
    }

    initialized() {
        return this.#initialized
    }

    start() {
        if (!this.#initialized) {
            this.doSubscribe()
            this.#initialized = true
        }
        this.close()
        const options = __env.get("aria2.rpc", {})
        const { host, port, secret, savePath } = options
        if (!host || !port) return;
        this.#secret = secret
        this.#savePath = savePath
        this.#urlPath = `${host}:${port}/jsonrpc`
        this.#nextConnectDelay = 5;
        this.#connect()
    }

    /**
     * websocket
     */
    #connect() {
        if (this.#ready) return;
        this.close()
        __log.debug(`[Aria2Socket] Prepare to connect.`)
        const client = new WebSocket(`ws://${this.#urlPath}`)
        client.on('open', () => this.#onOpen())
        client.on('message', data => this.#onMessage(data))
        client.on('error', e => this.#onError(e))
        client.on('close', () => this.#onClose())
        this.#client = client
    }

    #reconnect() {
        if (this.#ready) return
        this.close()
        if (this.#nextConnectDelay > this.#maxConnectDelay) return
        this.#nextConnectDelay *= 2
        __log.info(`[Aria2Socket] Prepare retry connect at ${this.#nextConnectDelay}s.`)
        this.#connectTimeout && clearTimeout(this.#connectTimeout)
        this.#connectTimeout = setTimeout(() => this.#connect(), this.#nextConnectDelay * 1000)
    }

    #onOpen() {
        __log.info('[Aria2Socket] Aria2 connected.')
        this.#ready = true;
        this.#nextConnectDelay = 5;
    }

    #onMessage(data) {
        const payload = JSON.parse(data);
        if (payload.method && payload.method.startsWith('aria2.on')) {
            const eventName = payload.method.split('.')[1];
            const params = payload.params;
            const gid = params[0].gid;
            try {
                this.#taskCallback.get(eventName)?.(gid)
            } catch (e) {
                __log.error(`[Aria2Socket] Do event[${eventName}] callback error.`, e)
            }
        }
    }

    #onError(e) {
        __log.error('[Aria2Socket] Aria2 connect error.', e)
        this.#ready = false
        this.#reconnect()
    }

    #onClose() {
        __log.info('[Aria2Socket] Aria2 closed.')
        this.close()
    }

    close() {
        this.#ready = false
        if (this.#client) {
            try {
                this.#client?.close?.();
            } catch (e) {
                __log.error('[Aria2Socket] Aria2 close error.', e)
            }
        }
        this.#client = null
        this.#connectTimeout && clearTimeout(this.#connectTimeout)
    }

    onEvent(event, callback) {
        if (isFunction(callback)) {
            this.#taskCallback.set(event, callback)
        }
    }

    /**
     * http call
     */
    #checkReady() {
        this.#ready || throwMessage('Aria2 not ready.')
    }

    async #call(method, ...options) {
        const requestData = {
            jsonrpc: '2.0',
            id: `node_${generateUUID()}`,
            method,
            params: [
                `token:${this.#secret}`,
                ...options
            ]
        };
        const { data } = await axios.post(`http://${this.#urlPath}`, requestData);
        if (data.error) {
            __log.error('RPC Error:', data.error.message);
            throwMessage(data.error.message || 'Call aria2 error.')
        } else {
            return data.result
        }
    }

    async addUri(url, opts = {}) {
        this.#checkReady()
        const options = {
            dir: path.join(this.#savePath, opts?.dir || '')
        }
        if (isNotBlank(opts.out)) {
            options.out = opts.out
        }
        return this.#call(ARIA2_METHOD.ADD_URI, [url], options)
    }

    async getInfo(gid) {
        return this.#call(ARIA2_METHOD.TELL_STATUS, gid, ["status", "totalLength", "completedLength", "downloadSpeed", "files"])
    }
}

export function getAria2Socket() {
    if (!Aria2Socket.instance.initialized()) {
        Aria2Socket.instance.start()
    }
    return Aria2Socket.instance
}