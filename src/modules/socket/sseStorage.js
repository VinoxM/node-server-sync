import { importFolderScripts } from "#utils/importUtil.js";
import { SSEClient } from "#core/infra/sseClient.js";

/**
 * @typedef {Object} SSEChannelConfig
 * @property {string} channel - SSE 频道标识名称
 * @property {(req: import('express').Request, clients: Record<string, SSEClient[]>) => boolean} validator - 连接权限验证函数
 * @property {(client: SSEClient, query: any) => void} [onConnected] - 客户端成功连接回调
 * @property {(client: SSEClient) => void} [onConfigurationRefreshed] - 配置热刷新联动回调
 * @property {() => void} [onDisconnected] - 客户端断开连接回调
 * @property {(query: any, opts: any, client: SSEClient) => boolean} [canWrite] - 事件写入过滤判定函数
 */

/**
 * Server-Sent Events (SSE) 服务端连接池与事件广播管理器 (单例模式)
 */
class SSEStore {
    /** @type {SSEStore} 单例实例 */
    static instance = new SSEStore();

    /** @type {Record<string, SSEClient[]>} 按频道分类存储的活跃 SSEClient 连接列表字典 */
    #clients = {};

    /** @type {Record<string, SSEChannelConfig>|null} 已加载的频道配置映射字典 */
    #channelConfigs = null;

    constructor() {
    }

    /**
     * 初始化注入各频道的静态路由与权限配置
     * @param {Record<string, SSEChannelConfig>} [channelConfigs={}] - 频道配置字典
     */
    initialize(channelConfigs = {}) {
        this.#channelConfigs = channelConfigs;
    }

    /**
     * 校验请求中的 channel 是否合法并满足 validator 权限规则
     * @param {import('express').Request} req - HTTP Request
     * @returns {SSEChannelConfig|null} 校验通过返回对应频道配置，否则返回 null
     */
    #verifyChannel(req) {
        const channel = req.query?.channel;
        if (typeof channel === 'string' && __isNotBlank(channel) && (this.#channelConfigs?.[channel]?.validator?.(req, this.#clients) ?? false)) {
            return this.#channelConfigs[channel];
        }
        return null;
    }

    /**
     * 将合法的 HTTP 请求升级为 SSE 长连接，并加入到当前频道的连接池中管理
     * @param {import('express').Request} req - HTTP Request
     * @param {import('express').Response} res - HTTP Response
     */
    store(req, res) {
        const clients = this.#clients;
        const channelConf = this.#verifyChannel(req);
        const channel = String(req.query?.channel);
        if (channelConf !== null) {
            const client = new SSEClient(req, res, channelConf);
            const uname = client.getUname();
            client.setupOnClosed(() => {
                const index = clients[channel]?.indexOf(client) ?? -1;
                if (index !== -1) {
                    clients[channel]?.splice(index, 1);
                }
                __log.info(`[SSE] Client closed. -x-> ${channel}:${uname}`);
            });
            if (!clients[channel]) {
                clients[channel] = [];
            }
            clients[channel].push(client);
            __log.info(`[SSE] Client connected. <== ${channel}:${uname}`);
        } else {
            __log.error('[SSE] Channel invalid, refuse sse request.');
            res.end('Channel invalid.');
        }
    }

    /**
     * 向指定频道下的所有活跃客户端广播事件与消息
     * @param {string} channel - 目标频道名称
     * @param {string} event - 事件名称 (如 'message', 'update', 'status')
     * @param {any} message - 消息数据 (字符串或 JSON 对象)
     * @param {any} [opts] - 附加过滤选项 (透传给 canWrite 判断)
     */
    broadcast(channel, event, message, opts) {
        const channels = this.#clients[channel];
        if (channels) {
            Array.from(channels).forEach(client => {
                client?.emitEvent?.(event, message, opts);
            });
        }
    }
}

/**
 * 将当前请求升级并存入 SSE 客户端连接池
 * @param {import('express').Request} req - HTTP Request
 * @param {import('express').Response} res - HTTP Response
 */
export function storeSSE(req, res) {
    SSEStore.instance.store(req, res);
}

/**
 * 向指定 SSE 频道全员广播事件消息
 * @param {string} channel - 目标频道名
 * @param {string} event - 事件类型名
 * @param {any} message - 消息载荷
 * @param {any} [opts] - 过滤控制选项
 */
export function broadcastSSE(channel, event, message, opts) {
    SSEStore.instance.broadcast(channel, event, message, opts);
}

/**
 * 自动扫描并加载 `@/src/api/sse` 目录下的所有 SSE 频道配置文件
 * @returns {Promise<void>}
 */
export async function sseInitialize() {
    const disabledSSE = Array.from(__env.get("sse.disabled", []));
    const configs = {};
    return importFolderScripts("@/src/api/sse", true, (module, name) => {
        if (disabledSSE.includes(name)) return;
        const channelConf = module.default;
        const { channel, validator, ...ops } = channelConf;
        if (__isNotBlank(channel) && __isFunction(validator) && !(channel in configs)) {
            configs[channel] = { channel, validator, ...ops };
            __log.info(`[SSE] Loaded sse configuration: ${channel}`);
        }
    }).then(() => SSEStore.instance.initialize(configs));
}