import { getItemOrElse, setItem } from "../common/objectUtil.js";

export class SocketClient {
    #socket;
    #channel;
    #channelPath;
    #realIp;
    #information = {};
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
        __log.info(`[Socket] ${this.#channelPath} ==> ${this.#realIp}${ignorePrint ? '' : (': ' + msg)}`);
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
        setItem(this.#information, key, value)
        __log.debug(`[Socket] Client[${this.#channel} : ${this.#realIp}] set info ${key} => `, value)
    }

    getInfo(key, defaultValue) {
        const value = getItemOrElse(this.#information, key, defaultValue)
        __log.debug(`[Socket] Client[${this.#channel} : ${this.#realIp}] get info ${key} => `, value)
        return value
    }

    close() {
        this.#socket.close();
        this.#socket = null;
    }
}