import { importFolderScripts } from '#utils/importUtil.js';
import { getConnections, storeConnection } from '#modules/socket/wsStorage.js';
import { apiServer } from './apiServer.js';

/**
 * @typedef {import('@types/socketTypes.d.ts').ServerStartOptions} ServerStartOptions
 */

/**
 * 自动扫描并加载 `@/src/api/filters` 目录下的所有请求过滤器，按 order 升序排序
 * @returns {Promise<Array<(req: any, res: any, next: () => void) => any>>} 过滤器中间件数组
 */
async function getApiFilters() {
    const filter = [];
    const disabledFilters = Array.from(__env.get("api.filterDisabled", []));
    return importFolderScripts("@/src/api/filters", false, (module, name) => {
        const m = module.default;
        (!disabledFilters.includes(name) && !m?.disabled && __isFunction(m?.doFilter)) && filter.push({ name, ...m });
    }).then(() => filter.sort((a, b) => (a.order || 0) - (b.order || 0)).map(obj => {
        const { name, doFilter } = obj;
        __log.info(`[Server] Loaded Request Filter: ${name}`);
        return doFilter;
    }));
}

/**
 * 自动扫描并加载 `@/src/api/sockets` 目录下的所有 WebSocket 频道
 * @returns {Promise<import('#modules/socket/wsStorage.js').WSServerConnection[]>}
 */
async function getSocketChannels() {
    const disabledSockets = Array.from(__env.get("socket.disabled", []));
    return importFolderScripts("@/src/api/sockets", true, (module, name) => {
        disabledSockets.includes(name) || storeConnection(module.default);
    }).then(() => getConnections());
}

/**
 * 启动 API Web 服务（加载过滤器、路由映射与 WebSocket 频道）
 * @param {ServerStartOptions} [options={}] - 服务启动附加配置
 * @returns {Promise<void>}
 */
export async function startServer(options = {}) {
    const instance = apiServer;
    if (instance.ready()) return Promise.resolve();
    instance.initialize();
    const apiFilters = await getApiFilters();
    instance.addApiFilters(apiFilters);
    if (__isNotEmptyArray(options.apiFilters)) {
        instance.addApiFilters(options.apiFilters);
    }
    await importFolderScripts("@/src/api/routes", true, mapping => instance.addApiMapping(mapping.default));
    if (__isNotEmptyArray(options.apiMapping)) {
        options.apiMapping.forEach(mapping => instance.addApiMapping(mapping.default));
    }
    const wsChannels = await getSocketChannels();
    instance.addWsChannels(wsChannels);
    await instance.start();
}