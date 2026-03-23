const defaultTimeoutMs = 1000

class AsyncSequence {
    static #globalCounter = 0;

    #id;
    #chain = Promise.resolve();
    #hasTimeout = false;
    #timeoutMs;
    #isStarted = false;
    #isFinished = false;
    #completedTasks = 0;
    #totalTasks = 0;

    constructor(timeoutMs = defaultTimeoutMs) {
        this.#id = ++AsyncSequence.#globalCounter;
        this.#timeoutMs = timeoutMs ?? defaultTimeoutMs;
    }

    #logPrefix() {
        return `[AsyncSequence#${this.#id}] `
    }

    get status() {
        if (!this.#isStarted) return "ready";
        if (this.#isFinished) return "finished";
        return "running_in_background";
    }

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

    addTasks(tasks) {
        if (Array.isArray(tasks)) {
            tasks.forEach(task => this.addTask(task));
        }
        return this;
    }

    async run() {
        if (this.#isStarted) {
            throw new Error(`[AsyncSequence #${this.#id}] Error: The instance is disposable and has already been started.`);
        }
        this.#isStarted = true;
        __log.info(this.#logPrefix() + `Task chain execution start, count: ${this.#totalTasks}, timeout: ${this.#timeoutMs}ms.`)

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.#hasTimeout = true;
                const process = `${this.#completedTasks}/${this.#totalTasks}`;
                __log.warn(this.#logPrefix() + `Execution timeout! The main process will leave first. Current progress: [${process}]`);
                resolve({
                    status: "timeout",
                    message: "Timeout has occurred. Main process continues; task moved to background.",
                    process
                });
            }, this.#timeoutMs);

            this.#chain.then(() => {
                this.#isFinished = true;
                if (!this.#hasTimeout) {
                    __log.info(this.#logPrefix() + `All tasks have been completed sequentially before timing out.`)
                    clearTimeout(timer);
                    resolve({ status: "success", message: "All tasks have been completed in sequence." });
                } else {
                    __log.info(this.#logPrefix() + `All tasks execution completed.`)
                }
            });
        });
    }
}

export async function createAsyncTaskChain(timeoutMs) {
    return new AsyncSequence(timeoutMs)
}

export async function executeAsyncTaskChain(tasks, timeoutMs) {
    return new AsyncSequence(timeoutMs).addTasks(tasks).run()
}