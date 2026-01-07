import { getItem, setItem } from "../common/objectUtil.js";

export class SocketClient {
    #socket;
    #channel;
    #channelPath;
    #realIp;
    #infomation = {};
    constructor(socket, channel, channelPath, realIp) {
        this.#socket = socket;
        this.#channel = channel;
        this.#channelPath = channelPath;
        this.#realIp = realIp;
    }

    send(message, ignorePrint) {
        if (!this.#socket) return;
        let msg = '';
        if (typeof message === 'string') {
            msg = message;
        } else if (typeof message === 'object') {
            try {
                msg = 'JSONObject::' + JSON.stringify(message)
            } catch (error) {
                return;
            }
        } else return;
        logger(`[Socket] ${this.#channelPath} ==> ${this.#realIp}${ignorePrint ? '' : (': ' + msg)}`);
        this.#socket.send(msg);
    }

    getSocket() {
        return this.#socket;
    }

    getChannel() {
        return this.#channel;
    }

    getRealIp() {
        return this.#realIp;
    }

    setInfo(key, value) {
        try {
            setItem(this.#infomation, key, value)
            debug(`[Socket] Client[${this.#channel} : ${this.#realIp}] set info ${key} => `, value)
        } catch (e) {
            error(`[Socket] Client[${this.#channel} : ${this.#realIp}] set info error. ${key} =x `, value, e)
        }
    }

    getInfo(key, defaultValue) {
        try {
            const value = getItem(this.#infomation, key)
            debug(`[Socket] Client[${this.#channel} : ${this.#realIp}] get info ${key} => `, value)
            return value
        } catch (e) {
            error(`[Socket] Client[${this.#channel} : ${this.#realIp}] get info error. ${key}`, e)
            return defaultValue ?? null
        }
    }

    close() {
        this.#socket.close();
        this.#socket = null;
    }
}