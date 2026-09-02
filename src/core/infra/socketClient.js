import { getItem, setItem } from "#utils/objectUtil.js";

/**
 * WebSocket 客户端连接会话封装类
 */
export class SocketClient {
    /** @type {import('ws').WebSocket|null} 底层 WebSocket 连接实例 */
    #socket;

    /** @type {string} 所属频道标识名 */
    #channel;

    /** @type {string} 所属 WebSocket 路由路径 */
    #channelPath;

    /** @type {string} 客户端真实 IP 地址 */
    #realIp;

    /** @type {Record<string, any>} 客户端会话自定义上下文存储字典 */
    #information = {};

    /**
     * @param {import('ws').WebSocket} socket - WebSocket 连接实例
     * @param {string} channel - 频道名称
     * @param {string} channelPath - 频道路由路径
     * @param {string} realIp - 客户端真实 IP 地址
     */
    constructor(socket, channel, channelPath, realIp) {
        this.#socket = socket;
        this.#channel = channel;
        this.#channelPath = channelPath;
        this.#realIp = realIp;
    }

    /**
     * 向当前客户端推送消息（支持字符串或 JSON 对象）
     * @param {string|object} message - 待推送的消息内容
     * @param {boolean} [ignorePrint=false] - 是否在日志中隐藏消息具体内容
     */
    send(message, ignorePrint) {
        if (!this.#socket) return;
        let msg = '';
        if (typeof message === 'string') {
            msg = message;
        } else if (typeof message === 'object') {
            try {
                msg = 'JSONObject::' + JSON.stringify(message);
            } catch (error) {
                return;
            }
        } else return;
        __log.info(`[Socket] ${this.#channelPath} ==> ${this.#realIp}${ignorePrint ? '' : (': ' + msg)}`);
        this.#socket.send(msg);
    }

    /**
     * 获取底层原生 WebSocket 连接
     * @returns {import('ws').WebSocket|null}
     */
    getSocket() {
        return this.#socket;
    }

    /**
     * 获取所属频道标识名
     * @returns {string}
     */
    getChannel() {
        return this.#channel;
    }

    /**
     * 获取客户端真实 IP
     * @returns {string}
     */
    getRealIp() {
        return this.#realIp;
    }

    /**
     * 写入会话上下文扩展数据
     * @param {string} key - 键名
     * @param {any} value - 键值
     */
    setInfo(key, value) {
        setItem(this.#information, key, value);
        __log.debug(`[Socket] Client[${this.#channel} : ${this.#realIp}] set info ${key} => `, value);
    }

    /**
     * 获取会话上下文扩展数据
     * @template T
     * @param {string} key - 键名
     * @param {T} [defaultValue] - 默认值
     * @returns {T}
     */
    getInfo(key, defaultValue) {
        const value = getItem(this.#information, key, defaultValue);
        __log.debug(`[Socket] Client[${this.#channel} : ${this.#realIp}] get info ${key} => `, value);
        return value;
    }

    /**
     * 主动关闭并释放当前 WebSocket 连接
     */
    close() {
        this.#socket?.close();
        this.#socket = null;
    }
}