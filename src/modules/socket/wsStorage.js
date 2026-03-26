import { WebSocketServer } from "ws";
import { getRequestRealIp } from "../../common/utils/requestUtil.js";
import { ipBlocker } from "../../core/instance/ipBlocker.js";
import { SocketClient } from '../../core/infra/socketClient.js';
import { totpCrypto } from "../../core/instance/totpCrypto.js";

const baseChannelPath = "/channel/";
const socketConnections = [];

export const getConnections = () => socketConnections;

export function storeConnection(config) {
    const { channel, disabled, secret, validation, onConnect, onMessage, printMessage } = config;
    if (disabled || !channel || socketConnections.some(con => con.channel === channel)) return;
    const wss = new WebSocketServer({ noServer: true });
    const channelPath = baseChannelPath + channel;
    const connection = { server: wss, path: channelPath, channel, clients: [] };
    socketConnections.push(connection);
    wss.on('connection', (ws, req) => {
        const realIp = getRequestRealIp(req);
        // check ip blocked.
        if (!ipBlocker.check(realIp, 'socket')) {
            ws.close(1000, 'Forbidden.');
            return;
        }
        // validate secret.
        let secretFlag = true;
        let url = new URL(req.url, 'http://a.b');
        if (secret) {
            let urlSecret = url.searchParams.get('secret');
            secretFlag = totpCrypto.verify(urlSecret);
        }
        if (!secretFlag) {
            ws.close(1000, 'Secret validate failed.');
            return;
        }
        // validate function
        let validationFlag = true;
        if (__isFunction(validation)) {
            try {
                validationFlag = validation(realIp, url.searchParams)
            } catch (e) {
                validationFlag = false
                __log.error(`[Socket] client connect validation failed.`, e)
            }
        }
        if (!validationFlag) {
            ws.close(1000, 'Validation failed.');
            return;
        }
        // connect success.
        __log.info(`[Socket] ${realIp} ->- ${connection.path}`);
        const client = new SocketClient(ws, channel, channelPath, realIp);
        connection.clients.push(client);
        if (__isFunction(onConnect)) onConnect(client, url.searchParams);
        ws.on('message', d => {
            __isFunction(onMessage) && onMessage(d, client);
        });
        ws.on('close', () => {
            __log.info(`[Socket] ${realIp} -x- ${connection.path}`);
            const index = connection.clients.indexOf(client);
            connection.clients.splice(index, 1);
        })
    })
}

export function getClientsByChannel(channel) {
    let clients = [];
    socketConnections.some(con => con.channel === channel && (clients = con.clients, true));
    return clients;
}