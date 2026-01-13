import { WebSocketServer } from "ws";
import { getRequestRealIp } from "../../common/httpUtil.js";
import { checkIp } from "../../common/apiIpBlock.js";
import { SocketClient } from '../../instance/socketClient.js';
import { verifyTOTP } from "../../common/totpUtil.js";

const baseChannelPath = "/channel/";
const socketConnections = [];

const getConnections = () => socketConnections;

const storeConnection = (config) => {
    const { channel, disabled, secret, validation, onConnect, onMessage, printMessage } = config;
    if (disabled || !channel || socketConnections.some(con => con.channel === channel)) return;
    const wss = new WebSocketServer({ noServer: true });
    const channelPath = baseChannelPath + channel;
    const connection = { server: wss, path: channelPath, channel, clients: [] };
    socketConnections.push(connection);
    wss.on('connection', (ws, req) => {
        const realIp = getRequestRealIp(req);
        // check ip blocked.
        if (!checkIp(realIp, 'socket')) {
            ws.close(1000, 'Server Busy.');
            return;
        }
        // validate secret.
        let secretFlag = true;
        let url = new URL(req.url, 'http://a.b');
        if (secret) {
            let urlSecret = url.searchParams.get('secret');
            secretFlag = verifyTOTP(urlSecret);
        }
        if (!secretFlag) {
            ws.close(1000, 'Secret validate failed.');
            return;
        }
        // validate function
        let validationFlag = true;
        if (isFunction(validation)) {
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
        if (isFunction(onConnect)) onConnect(client, url.searchParams);
        ws.on('message', d => {
            // logger(`[Socket] ${realIp} ==> ${connection.path}${printMessage ? (': ' + d) : ''}`);
            isFunction(onMessage) && onMessage(d, client);
        });
        ws.on('close', () => {
            __log.info(`[Socket] ${realIp} -x- ${connection.path}`);
            const index = connection.clients.indexOf(client);
            connection.clients.splice(index, 1);
        })
    })
}

const getClientsByChannel = (channel) => {
    let clients = [];
    socketConnections.some(con => con.channel === channel && (clients = con.clients, true));
    return clients;
}

export {
    getConnections,
    storeConnection,
    getClientsByChannel
}