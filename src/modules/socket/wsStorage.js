import { WebSocketServer } from "ws";
import { getRequestRealIp } from "#utils/requestUtil.js";
import { ipBlocker } from "#core/instance/ipBlocker.js";
import { SocketClient } from '#core/infra/socketClient.js';
import { totpCrypto } from "#core/instance/totpCrypto.js";

/**
 * @typedef {Object} WSChannelConfig
 * @property {string} channel - WebSocket 频道标识名称
 * @property {boolean} [disabled=false] - 是否禁用当前频道
 * @property {boolean} [secret=false] - 是否开启 TOTP 动态安全秘钥校验
 * @property {(realIp: string, params: URLSearchParams) => boolean} [validation] - 客户端连接额外自定义校验函数
 * @property {(client: SocketClient, params: URLSearchParams) => void} [onConnect] - 客户端成功建立连接后的回调
 * @property {(data: import('ws').Data, client: SocketClient) => void} [onMessage] - 收到客户端消息时的回调
 * @property {boolean} [printMessage=false] - 是否在控制台打印收发的消息
 */

/**
 * @typedef {Object} WSServerConnection
 * @property {WebSocketServer} server - 底层 WebSocketServer 实例
 * @property {string} path - 路由监听路径 (如 `/channel/media`)
 * @property {string} channel - 频道名称
 * @property {SocketClient[]} clients - 当前连接在线的客户端列表
 */

/** @type {string} WebSocket 频道路由前缀 */
const baseChannelPath = "/channel/";

/** @type {WSServerConnection[]} 全局活跃的 WebSocket 频道服务连接配置列表 */
const socketConnections = [];

/**
 * 获取当前所有已注册的 WebSocket 频道连接配置
 * @returns {WSServerConnection[]}
 */
export const getConnections = () => socketConnections;

/**
 * 注册并开启单个 WebSocket 频道连接服务
 * @param {WSChannelConfig} config - 频道配置参数
 */
export function storeConnection(config) {
    const { channel, disabled, secret, validation, onConnect, onMessage, printMessage } = config;
    if (disabled || !channel || socketConnections.some(con => con.channel === channel)) return;

    const wss = new WebSocketServer({ noServer: true });
    const channelPath = baseChannelPath + channel;
    const connection = { server: wss, path: channelPath, channel, clients: [] };
    socketConnections.push(connection);

    wss.on('connection', (ws, req) => {
        const realIp = getRequestRealIp(req);

        // 1. IP 访问限制与黑名单封禁校验
        if (!ipBlocker.check(realIp, 'socket')) {
            ws.close(1000, 'Forbidden.');
            return;
        }

        // 2. TOTP 动态口令校验
        let secretFlag = true;
        let url = new URL(req.url ?? '', 'http://localhost');
        if (secret) {
            let urlSecret = url.searchParams.get('secret');
            secretFlag = totpCrypto.verify(urlSecret ?? '');
        }
        if (!secretFlag) {
            ws.close(1000, 'Secret validate failed.');
            return;
        }

        // 3. 自定义 validation 业务权限校验
        let validationFlag = true;
        if (__isFunction(validation)) {
            try {
                validationFlag = validation(realIp, url.searchParams);
            } catch (e) {
                validationFlag = false;
                __log.error(`[Socket] client connect validation failed.`, e);
            }
        }
        if (!validationFlag) {
            ws.close(1000, 'Validation failed.');
            return;
        }

        // 4. 握手校验通过，实例化 SocketClient 并加入活跃列表
        __log.info(`[Socket] ${realIp} ->- ${connection.path}`);
        const client = new SocketClient(ws, channel, channelPath, realIp);
        connection.clients.push(client);

        if (__isFunction(onConnect)) {
            onConnect(client, url.searchParams);
        }

        ws.on('message', d => {
            __isFunction(onMessage) && onMessage(d, client);
        });

        ws.on('close', () => {
            __log.info(`[Socket] ${realIp} -x- ${connection.path}`);
            const index = connection.clients.indexOf(client);
            if (index !== -1) {
                connection.clients.splice(index, 1);
            }
        });
    });
}

/**
 * 获取指定频道当前所有在线连接的客户端实例列表
 * @param {string} channel - 频道名称
 * @returns {SocketClient[]} 在线客户端列表
 */
export function getClientsByChannel(channel) {
    let clients = [];
    socketConnections.some(con => con.channel === channel && (clients = con.clients, true));
    return clients;
}