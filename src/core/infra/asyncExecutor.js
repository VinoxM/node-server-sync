/**
 * 异步并行/并发任务执行器
 * 支持任务队列排队、最大并发数控制、链式数据传递、提前完成 (complete) 与异常熔断 (reject)
 *
 * @example
 * const executor = new AsyncExecutor(onSuccess, onError, coreSize);
 * executor.submit((resolve, reject, complete, data) => { ... }).start(initData);
 */
export class AsyncExecutor {
    /** @type {Array<(resolve: Function, reject: Function, complete: Function, prevData: any) => any>} 待执行的异步任务队列 */
    #taskQueue = [];

    /** @type {number} 当前正在并发执行的任务数量 */
    #running = 0;

    /** @type {((err: any) => void)|null} 发生异常时的错误回调 */
    #onError = null;

    /** @type {(() => void)|null} 所有任务执行完成或触发 complete 后的成功回调 */
    #onSuccess = null;

    /** @type {number} 执行器状态 (0: prepare就绪, 1: running运行中, -1: complete已完成, -2: error已出错) */
    #status = 0;

    /** @type {number} 最大并发执行数 */
    #coreSize;

    /**
     * @param {(() => void)} [onSuccess] - 全部任务成功执行完成（或被提前 complete）时的回调函数
     * @param {((err: any) => void)} [onError] - 任一任务抛出异常或调用 reject 时的失败回调函数
     * @param {number} [coreSize=1] - 最大并发执行线程/任务数
     */
    constructor(onSuccess, onError, coreSize = 1) {
        if (onSuccess) this.#onSuccess = onSuccess;
        if (onError) this.#onError = onError;
        this.#coreSize = coreSize > 0 ? coreSize : 1;
    }

    /**
     * 向队列中提交单个异步任务
     * @param {(resolve: (data?: any) => void, reject: (err?: any) => void, complete: () => void, prevData?: any) => any} task - 异步任务执行函数
     * @returns {this} 当前执行器实例（支持链式调用）
     */
    submit(task) {
        this.#taskQueue.push(task);
        if (this.#running < this.#coreSize && this.#status === 1) {
            this.#run().then();
        }
        return this;
    }

    /**
     * 向队列中批量提交多个异步任务
     * @param {Array<(resolve: (data?: any) => void, reject: (err?: any) => void, complete: () => void, prevData?: any) => any>} taskArr - 异步任务执行函数数组
     * @returns {this} 当前执行器实例（支持链式调用）
     */
    submitAll(taskArr) {
        if (__isNotEmptyArray(taskArr)) {
            this.#taskQueue = [...this.#taskQueue, ...taskArr];
            if (this.#running < this.#coreSize && this.#status === 1) {
                this.#run().then();
            }
        }
        return this;
    }

    /**
     * 内部调度工作线程循环执行队列中的任务
     * @param {any} [initData] - 初始传入的数据
     * @returns {Promise<void>}
     */
    #run(initData) {
        this.#running++;
        const run = (prev) => {
            if (this.#status >= 0) {
                if (this.#taskQueue.length > 0) {
                    const task = this.#taskQueue.shift();
                    const completeError = new Error();
                    return new Promise(async (resolve, reject) => {
                        const complete = () => { reject(completeError); };
                        try {
                            return await task(resolve, reject, complete, prev);
                        } catch (error) {
                            reject(error);
                        }
                    })
                        .then(run)
                        .catch(err => {
                            this.#running--;
                            this.#status = -2;
                            if (err === completeError) {
                                this.#onSuccess?.();
                            } else if (this.#onError) this.#onError(err);
                        });
                }
            }
            this.#running--;
            if (this.#running === 0 && this.#status === 1) {
                this.#status = -1;
                if (this.#onSuccess) this.#onSuccess();
            }
        };
        return new Promise(() => {
            run(initData);
        });
    }

    /**
     * 启动执行器并按 coreSize 并发数开始消费执行任务队列
     * @param {any} [initData] - 传递给首批任务的初始数据
     */
    start(initData) {
        if (this.#status > 0) return;
        this.#status = 1;
        for (let i = 0; i < this.#coreSize; i++) {
            this.#run(initData);
        }
    }
}