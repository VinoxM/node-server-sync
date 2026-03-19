import WebSocket from 'ws'
import axios from 'axios'
import path from 'path'
import { ContextSubscribe } from '../context/subscribe.js'
import { generateUUID } from '../common/stringUtil.js'

const ARIA2_METHOD = {
    ADD_URI: "aria2.addUri",
    TELL_STATUS: 'aria2.tellStatus',
    REMOVE: 'aria2.remove'
}

class Aria2Socket extends ContextSubscribe {

    static instance = new Aria2Socket()

    #initialized = false

    #ready = false
    #client = null
    #secret = null
    #savePath = null

    #wsUrl = null
    #rpcUrl = null

    #reconnecting = false
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
        if (parseInt(port) === 443) {
            this.#wsUrl = `wss://${host}:${port}/jsonrpc`
            this.#rpcUrl = `https://${host}:${port}/jsonrpc`
        } else {
            this.#wsUrl = `ws://${host}:${port}/jsonrpc`
            this.#rpcUrl = `http://${host}:${port}/jsonrpc`
        }
        this.#nextConnectDelay = 5;
        this.#connect()
    }

    /**
     * websocket
     */
    #connect() {
        if (this.#ready) return;
        this.close()
        __log.debug(`[Aria2Socket] Prepare to connect: ${this.#wsUrl}`)
        const client = new WebSocket(this.#wsUrl)
        client.on('open', () => this.#onOpen())
        client.on('message', data => this.#onMessage(data))
        client.on('error', e => this.#onError(e))
        client.on('close', () => this.#onClose())
        this.#client = client
    }

    #reconnect() {
        if (this.#ready || this.#reconnecting) return
        this.#reconnecting = true
        this.close()
        if (this.#nextConnectDelay > this.#maxConnectDelay) {
            __log.warn(`[Aria2Socket] The maximum retry delay time: ${this.#maxConnectDelay} has been reached, retries will stop.`)
            this.#reconnecting = false
            return
        }
        this.#nextConnectDelay *= 2
        __log.info(`[Aria2Socket] Prepare retry connect after ${this.#nextConnectDelay}s.`)
        this.#connectTimeout && clearTimeout(this.#connectTimeout)
        this.#connectTimeout = setTimeout(() => this.#connect(), this.#nextConnectDelay * 1000)
    }

    #onOpen() {
        __log.info('[Aria2Socket] Aria2 connected.')
        this.#ready = true;
        this.#reconnecting = false;
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
        this.close()
    }

    #onClose() {
        __log.info('[Aria2Socket] Aria2 closed.')
        this.#ready = false
        this.#reconnecting = false
        this.#reconnect()
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
        const { data } = await axios.post(this.#rpcUrl, requestData);
        if (data.error) {
            __log.error('RPC Error:', data.error.message);
            throwMessage(data.error.message || 'Call aria2 error.')
        } else {
            return data.result
        }
    }

    async addUri(url, opts = {}) {
        const { dir, out, ...otherOpts } = opts
        this.#checkReady()
        const options = {
            dir: path.join(this.#savePath, dir || '')
        }
        if (isNotBlank(out)) {
            options.out = out
        }
        return this.#call(ARIA2_METHOD.ADD_URI, [url], { ...options, ...otherOpts })
    }

    async getInfo(gid) {
        return this.#call(ARIA2_METHOD.TELL_STATUS, gid, ["gid", "status", "totalLength", "completedLength", "downloadSpeed", "files", "dir"])
    }

    async remove(gid) {
        return this.#call(ARIA2_METHOD.REMOVE, gid)
    }
}

export function aria2SocketInitialization() {
    if (!Aria2Socket.instance.initialized()) {
        Aria2Socket.instance.start()
    }
}

export function getAria2Socket() {
    aria2SocketInitialization()
    return Aria2Socket.instance
}