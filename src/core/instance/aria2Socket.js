import WebSocket from 'ws'
import axios from 'axios'
import path from 'path'
import { ContextSubscribe } from '../context/subscribe.js'
import { generateUUID } from '../../common/utils/cryptoUtil.js'

const ARIA2_METHOD = {
    ADD_URI: "aria2.addUri",
    TELL_STATUS: 'aria2.tellStatus',
    REMOVE: 'aria2.remove',
    MULTI_CALL: 'system.multicall',
    PAUSE: 'aria2.pause',
    RESUME: 'aria2.unpause'
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
        this.close(this.#client)
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
        __log.debug(`[Aria2Socket] Prepare to connect: ${this.#wsUrl}`)
        const client = new WebSocket(this.#wsUrl)
        const instanceId = generateUUID()
        client.on('open', () => this.#onOpen(instanceId))
        client.on('message', data => this.#onMessage(data))
        client.on('error', e => this.#onError(e, client))
        client.on('close', () => this.#onClose(client, instanceId))
        this.#client = client
    }

    #reconnect() {
        if (this.#ready || this.#reconnecting) return
        this.#reconnecting = true
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

    #onOpen(instanceId) {
        __log.info(`[Aria2Socket] Aria2 connected. InstanceId: ${instanceId}`)
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

    #onError(e, client) {
        __log.error('[Aria2Socket] Aria2 error.', e)
        this.close(client)
    }

    #onClose(client, instanceId) {
        __log.info(`[Aria2Socket] Aria2 closed. InstanceId: ${instanceId}`)
        if (this.#client === client) {
            this.#ready = false
            this.#reconnecting = false
            this.#reconnect()
        }
    }

    close(client) {
        this.#ready = false
        if (this.#client === client) {
            this.#client = null
        }
        try {
            client?.close?.();
        } catch (e) {
            __log.error('[Aria2Socket] Aria2 close error.', e)
        }
        this.#connectTimeout && clearTimeout(this.#connectTimeout)
    }

    onEvent(event, callback) {
        if (__isFunction(callback)) {
            this.#taskCallback.set(event, callback)
        }
    }

    /**
     * http call
     */
    #checkReady() {
        this.#ready || __throwMessage('Aria2 not ready.')
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
            __throwMessage(data.error.message || 'Call aria2 error.')
        } else {
            return data.result
        }
    }

    async #multiCall(method, ...options) {
        const requestData = {
            jsonrpc: '2.0',
            id: `node_${generateUUID()}`,
            method: ARIA2_METHOD.MULTI_CALL,
            params: [
                options.map(opt => ({ methodName: method, params: [`token:${this.#secret}`, ...opt] }))
            ]
        };
        const { data } = await axios.post(this.#rpcUrl, requestData);
        if (data.error) {
            __log.error('RPC Error:', data.error.message);
            __throwMessage(data.error.message || 'Call aria2 error.')
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
        if (__isNotBlank(out)) {
            options.out = out
        }
        return this.#call(ARIA2_METHOD.ADD_URI, [url], { ...options, ...otherOpts })
    }

    async getInfo(gid) {
        return this.#call(ARIA2_METHOD.TELL_STATUS, gid, ["gid", "status", "totalLength", "completedLength", "downloadSpeed", "files", "dir"])
    }

    async pause(gid) {
        return this.#call(ARIA2_METHOD.PAUSE, gid)
    }

    async resume(gid) {
        return this.#call(ARIA2_METHOD.RESUME, gid)
    }

    async remove(gid) {
        return this.#call(ARIA2_METHOD.REMOVE, gid)
    }

    async getMultiStatus(gidArr) {
        return this.#multiCall(ARIA2_METHOD.TELL_STATUS, ...gidArr.map(gid => ([gid, ["gid", "status", "totalLength", "completedLength"]])))
    }
}

export function aria2SocketInitialize() {
    if (!Aria2Socket.instance.initialized()) {
        Aria2Socket.instance.start()
    }
}

export function getAria2Socket() {
    aria2SocketInitialize()
    return Aria2Socket.instance
}