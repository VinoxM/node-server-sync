/**
 * 标准停机优先级枚举常量
 * 数值越大越先执行，同一优先级的任务并发执行
 * @readonly
 * @enum {string}
 */
export const SHUTDOWN_PRIORITY = Object.freeze({
    /** 最高优先级 (1000)：最先执行，如停止外部流量接单、停止定时任务触发并协同排空 */
    FIRST: 1000,
    /** 高优先级 (100)：关键入口服务与长连接注销 (如 WebSocket/SSE 断开) */
    HIGH: 100,
    /** 普通优先级 (0)：默认业务清理 (如释放锁、同步内存状态、临时文件清理) */
    NORMAL: 0,
    /** 低优先级 (-100)：底层基础设施释放 (如断开 SQLite/Redis 数据库连接池) */
    LOW: -100,
    /** 最低优先级 (-1000)：最后执行的业务钩子 (如临时缓存目录物理清理) */
    LAST: -1000
});

/**
 * 停机与优雅退出钩子管理器
 * 用于统一管理、注册和按优先级分阶段调度各模块在应用退出时的异步清理任务
 *
 * @example
 * const hook = new ShutdownHook();
 * // 注册高优先级任务
 * hook.add(async (signal) => { await schedule.gracefulShutdown(); }, 'Schedule', SHUTDOWN_PRIORITY.FIRST);
 * // 注册普通业务任务
 * const id = hook.add(async (signal) => { await redis.quit(); }, 'RedisClose');
 * hook.remove(id); // 可根据 ID 取消注册
 * await hook.executeAll(15000); // 停机时按优先级分阶段执行所有钩子
 */
export class ShutdownHook {
    /** @type {ShutdownHook} 全局单例 */
    static instance = new ShutdownHook();

    /** @type {Map<number, { callback: (signal?: AbortSignal) => any|Promise<any>, name: string, priority: number }>} 钩子集合 */
    #hooks = new Map();

    /** @type {number} 自增序号计数器 */
    #nextId = 1;

    /** @type {boolean} 是否正在执行关停清理流程 */
    #isShuttingDown = false;

    /**
     * 当前是否正在执行停机清理
     * @returns {boolean}
     */
    get isShuttingDown() {
        return this.#isShuttingDown;
    }

    /**
     * 当前已注册的清理钩子总数
     * @returns {number}
     */
    get size() {
        return this.#hooks.size;
    }

    /**
     * 注册一个退出清理钩子，返回自增的唯一序号 ID
     * @param {(signal?: AbortSignal) => any|Promise<any>} callback - 清理回调函数（支持同步或异步 Promise）
     * @param {string|{ name?: string, priority?: number }} [nameOrOptions] - 钩子名称或配置对象
     * @param {number} [priority=SHUTDOWN_PRIORITY.NORMAL] - 优先级（数值越大越先执行，默认为 0）
     * @returns {number} 唯一自增序号 ID（可用于 remove 取消注册）
     */
    add(callback, nameOrOptions, priority = SHUTDOWN_PRIORITY.NORMAL) {
        if (!__isFunction(callback)) {
            __throwMessage('Shutdown hook callback must be a function.');
        }
        if (this.#isShuttingDown) {
            __log.warn(`[ShutdownHook] Cannot register new hook while shutting down.`);
            return -1;
        }

        let hookName = '';
        let hookPriority = priority;

        if (typeof nameOrOptions === 'object' && nameOrOptions !== null) {
            hookName = nameOrOptions.name || '';
            hookPriority = typeof nameOrOptions.priority === 'number' ? nameOrOptions.priority : priority;
        } else if (typeof nameOrOptions === 'string') {
            hookName = nameOrOptions;
        }

        const id = this.#nextId++;
        hookName = hookName || callback.name || `Hook#${id}`;
        this.#hooks.set(id, { callback, name: hookName, priority: hookPriority });
        return id;
    }

    /**
     * 别名注册方法（与 add 等价）
     * @param {(signal?: AbortSignal) => any|Promise<any>} callback
     * @param {string|{ name?: string, priority?: number }} [nameOrOptions]
     * @param {number} [priority=SHUTDOWN_PRIORITY.NORMAL]
     * @returns {number}
     */
    register(callback, nameOrOptions, priority) {
        return this.add(callback, nameOrOptions, priority);
    }

    /**
     * 根据序号 ID 取消指定的清理钩子
     * @param {number} id - 注册时返回的自增序号 ID
     * @returns {boolean} 是否成功移除
     */
    remove(id) {
        if (typeof id !== 'number' || id <= 0) return false;
        return this.#hooks.delete(id);
    }

    /**
     * 别名取消注册方法（与 remove 等价）
     * @param {number} id
     * @returns {boolean}
     */
    unregister(id) {
        return this.remove(id);
    }

    /**
     * 检查指定序号 ID 的钩子是否存在
     * @param {number} id
     * @returns {boolean}
     */
    has(id) {
        return this.#hooks.has(id);
    }

    /**
     * 清空所有已注册的清理钩子
     */
    clear() {
        this.#hooks.clear();
    }

    /**
     * 按优先级由高到低分阶段触发并等待所有清理钩子执行完成
     * - 同一优先级的钩子：并发并行执行 (`Promise.allSettled`)
     * - 不同优先级的钩子：按权重降序串行等待推进
     *
     * @param {number} [timeoutMs=20000] - 全局最大允许停机执行总超时时间（毫秒）
     * @returns {Promise<{ completed: boolean, count: number, failedCount: number, errors: Array<{ id: number, name: string, priority: number, error: any }> }>}
     */
    async executeAll(timeoutMs = 20000) {
        if (this.#isShuttingDown) {
            return { completed: true, count: 0, failedCount: 0, errors: [] };
        }

        this.#isShuttingDown = true;
        const total = this.#hooks.size;

        if (total === 0) {
            this.#isShuttingDown = false;
            return { completed: true, count: 0, failedCount: 0, errors: [] };
        }

        __log.info(`[ShutdownHook] Starting shutdown pipeline for ${total} hook(s) with total timeout ${timeoutMs}ms...`);

        // 按优先级降序分组
        const priorityMap = new Map();
        for (const [id, item] of this.#hooks.entries()) {
            const p = item.priority;
            if (!priorityMap.has(p)) {
                priorityMap.set(p, []);
            }
            priorityMap.get(p).push({ id, ...item });
        }

        const sortedPriorities = Array.from(priorityMap.keys()).sort((a, b) => b - a);
        const controller = new AbortController();
        const errors = [];
        let completedCount = 0;
        let isOverallTimeout = false;
        const startTime = Date.now();

        // 统一总超时定时器
        let timeoutTimer;
        const timeoutPromise = new Promise(resolve => {
            timeoutTimer = setTimeout(() => {
                isOverallTimeout = true;
                controller.abort(new Error('Overall shutdown execution timed out.'));
                resolve('TIMEOUT');
            }, timeoutMs);
        });

        // 核心执行流程：按优先级分阶段串行推进
        const pipelinePromise = (async () => {
            for (const priority of sortedPriorities) {
                if (isOverallTimeout) break;

                const stageHooks = priorityMap.get(priority);
                __log.info(`[ShutdownHook] Executing stage [Priority: ${priority}] with ${stageHooks.length} hook(s): ${stageHooks.map(h => h.name).join(', ')}`);

                const stageTasks = stageHooks.map(async ({ id, callback, name, priority }) => {
                    try {
                        const res = callback(controller.signal);
                        if (__isPromise(res)) {
                            await res;
                        }
                        completedCount++;
                    } catch (err) {
                        __log.error(`[ShutdownHook] Hook [${name}] (id: ${id}, priority: ${priority}) failed: ${err?.message || err}`, err);
                        errors.push({ id, name, priority, error: err });
                    }
                });

                await Promise.allSettled(stageTasks);
            }
            return 'DONE';
        })();

        const outcome = await Promise.race([pipelinePromise, timeoutPromise]);
        clearTimeout(timeoutTimer);

        const duration = Date.now() - startTime;
        if (outcome === 'TIMEOUT' || isOverallTimeout) {
            __log.warn(`[ShutdownHook] Shutdown pipeline timed out after ${duration}ms! Completed: ${completedCount}/${total}, Failed: ${errors.length}`);
        } else {
            __log.info(`[ShutdownHook] All ${total} shutdown hook(s) finished in ${duration}ms (Completed: ${completedCount}, Failed: ${errors.length}).`);
        }

        this.#hooks.clear();
        this.#isShuttingDown = false;

        return {
            completed: outcome === 'DONE' && !isOverallTimeout,
            count: total,
            failedCount: errors.length,
            errors
        };
    }
}

/** 全局停机钩子管理器单例导出 */
export const shutdownHook = ShutdownHook.instance;
