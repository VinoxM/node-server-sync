const defaultTimeoutMs = 1000;

/**
 * 异步任务链执行结果状态枚举
 */
export const ASYNC_SEQUENCE_EXECUTE_STATUS = {
    /** 全部任务在超时前顺利按序执行完毕 */
    SUCCESS: 'success',
    /** 达到超时阈值，主流程提前返回，剩余任务转入后台继续执行 */
    TIMEOUT: 'timeout'
};

/**
 * 异步串行任务链执行器（支持超时后让主流程脱离并在后台继续执行）
 */
class AsyncSequence {
    /** @type {number} 全局序列实例自增计数器 */
    static #globalCounter = 0;

    /** @type {number} 当前任务序列实例唯一标识 ID */
    #id;

    /** @type {Promise<void>} 内部 Promise 串行任务链 */
    #chain = Promise.resolve();

    /** @type {boolean} 是否已发生超时 */
    #hasTimeout = false;

    /** @type {number} 超时时间阈值 (毫秒) */
    #timeoutMs;

    /** @type {boolean} 是否已启动执行 */
    #isStarted = false;

    /** @type {boolean} 全部任务是否已彻底执行完成 */
    #isFinished = false;

    /** @type {number} 已成功执行完成的任务计数 */
    #completedTasks = 0;

    /** @type {number} 待执行的任务总数 */
    #totalTasks = 0;

    /**
     * @param {number} [timeoutMs=1000] - 超时等待时间 (毫秒)，超时后主流程先行 resolve，未执行完的任务转入后台
     */
    constructor(timeoutMs = defaultTimeoutMs) {
        this.#id = ++AsyncSequence.#globalCounter;
        this.#timeoutMs = timeoutMs ?? defaultTimeoutMs;
    }

    /**
     * 日志输出统一前缀
     * @returns {string}
     */
    #logPrefix() {
        return `[AsyncSequence#${this.#id}] `;
    }

    /**
     * 获取当前任务链运行状态 ('ready' | 'finished' | 'running_in_background')
     * @returns {string}
     */
    get status() {
        if (!this.#isStarted) return "ready";
        if (this.#isFinished) return "finished";
        return "running_in_background";
    }

    /**
     * 添加单个异步任务至串行执行链
     * @param {() => Promise<void>|void} task - 异步任务执行函数
     * @returns {this}
     */
    addTask(task) {
        if (this.#isStarted) {
            __log.warn(this.#logPrefix() + "The task chain has been started and new tasks cannot be added.");
            return this;
        }
        if (typeof task === 'function') {
            this.#totalTasks++;
            const taskIndex = this.#totalTasks;

            this.#chain = this.#chain.then(async () => {
                const remaining = this.#totalTasks - taskIndex;
                __log.info(this.#logPrefix() + `Start task execution [${taskIndex}/${this.#totalTasks}], remaining: ${remaining}`);

                const start = Date.now();
                try {
                    await task();
                    this.#completedTasks++;
                    const duration = Date.now() - start;
                    __log.info(this.#logPrefix() + `Task [${taskIndex}] complete, used ${duration}ms`);
                } catch (err) {
                    __log.error(this.#logPrefix() + `Task [${taskIndex}] failed.`, err?.message ?? err);
                }
            });
        }
        return this;
    }

    /**
     * 批量添加多个异步任务至串行执行链
     * @param {Array<() => Promise<void>|void>} tasks - 异步任务数组
     * @returns {this}
     */
    addTasks(tasks) {
        if (Array.isArray(tasks)) {
            tasks.forEach(task => this.addTask(task));
        }
        return this;
    }

    /**
     * 启动异步任务链串行执行
     * 若在指定超时时间内未全部完成，主流程会提前 resolve 返回超时状态，而任务链将在后台继续执行完毕
     * @returns {Promise<{ status: string, message: string, process?: string }>} 执行结果信息
     */
    async run() {
        if (this.#isStarted) {
            throw new Error(`[AsyncSequence #${this.#id}] Error: The instance is disposable and has already been started.`);
        }
        this.#isStarted = true;
        __log.info(this.#logPrefix() + `Task chain execution start, count: ${this.#totalTasks}, timeout: ${this.#timeoutMs}ms.`);

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.#hasTimeout = true;
                const process = `${this.#completedTasks}/${this.#totalTasks}`;
                __log.warn(this.#logPrefix() + `Execution timeout! The main process will leave first. Current progress: [${process}]`);
                resolve({
                    status: ASYNC_SEQUENCE_EXECUTE_STATUS.TIMEOUT,
                    message: "Timeout has occurred. Main process continues; task moved to background.",
                    process
                });
            }, this.#timeoutMs);

            this.#chain.then(() => {
                this.#isFinished = true;
                if (!this.#hasTimeout) {
                    __log.info(this.#logPrefix() + `All tasks have been completed sequentially before timing out.`);
                    clearTimeout(timer);
                    resolve({ status: ASYNC_SEQUENCE_EXECUTE_STATUS.SUCCESS, message: "All tasks have been completed in sequence." });
                } else {
                    __log.info(this.#logPrefix() + `All tasks execution completed.`);
                }
            });
        });
    }
}

/**
 * 便捷执行一组异步串行任务链
 * @param {Array<() => Promise<void>|void>} tasks - 待执行的任务数组
 * @param {number} [timeoutMs] - 超时等待时间 (毫秒)
 * @returns {Promise<{ status: string, message: string, process?: string }>} 执行结果
 */
export async function executeAsyncTaskChain(tasks, timeoutMs) {
    return new AsyncSequence(timeoutMs).addTasks(tasks).run();
}