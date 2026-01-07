/**
 * 异步并行执行器;
 * exam: 
 * const executor = new Executor(onSuccess, onError, coreSize);
 * executor.submit((resolve, reject, complete, data)=>{...doSomeThing()}).start(initData);
 * @constructor 
 *  onSuccess: 全部任务执行成功回调. 所有任务成功/有任务执行了complete回调后执行;
 *  onError: 有任务执行异常回调. 有任务执行失败/执行了reject回调后执行;
 *  coreSize: 任务最大并行数;
 * @submit 
 *  task: 一个异步任务;
 *  @task
 *  resolve: 回调,执行下一个任务;
 *  reject: 回调,抛出异常,执行onError异常回调.将终止后续所有任务执行;
 *  complete: 回调,执行onSuccess成功回调.将终止后续所有任务执行;
 *  data: 上一个任务执行成功后传递的数据;
 * @submitAll
 *  taskArr: 多个异步任务;
 * @start
 *  initData: 传入的初始数据.
 */
export class Executor {
    #taskQueue = [];
    #running = 0;
    #onError = null;
    #onSuccess = null;
    #status = 0; // 0: prepare, 1: running, -1: complete, -2: error
    #coreSize;

    constructor(onSuccess, onError, coreSize = 1) {
        if (onSuccess) this.#onSuccess = onSuccess;
        if (onError) this.#onError = onError;
        this.#coreSize = coreSize > 0 ? coreSize : 1;
    }

    submit(task) {
        this.#taskQueue.push(task);
        if (this.#running < this.#coreSize && this.#status === 1) {
            this.#run().then();
        }
        return this;
    }

    submitAll(taskArr) {
        if (isNotEmptyArray(taskArr)) {
            this.#taskQueue = [...this.#taskQueue, ...taskArr];
            if (this.#running < this.#coreSize && this.#status === 1) {
                this.#run().then();
            }
        }
        return this;
    }

    #run(initData) {
        this.#running++;
        const run = (prev) => {
            if (this.#status >= 0) {
                if (this.#taskQueue.length > 0) {
                    const task = this.#taskQueue.shift();
                    const completeError = new Error();
                    return new Promise((resolve, reject) => {
                        const complete = () => { reject(completeError) }
                        task(resolve, reject, complete, prev);
                    })
                        .then(run)
                        .catch(err => {
                            this.#running--;
                            this.#status = -2;
                            if (err === completeError) {
                                this.#onSuccess();
                            } else if (this.#onError) this.#onError(err);
                        })
                }
            }
            this.#running--;
            if (this.#running === 0 && this.#status === 1) {
                this.#status = -1;
                if (this.#onSuccess) this.#onSuccess();
            }
        }
        return new Promise(()=>{
            run(initData);
        });
    }

    start(initData) {
        if (this.#status > 0) return;
        this.#status = 1;
        for (let i = 0; i < this.#coreSize; i++) {
            this.#run(initData);
        }
    }
}