class AsyncSequence {
    #chain = Promise.resolve();
    #hasTimeout = false;

    constructor() {
    }

    #addTasks(tasks) {
        tasks.forEach(task => {
            this.#chain = this.#chain.then(async () => {
                try {
                    await task();
                } catch (err) {
                    __log.info("[AsyncSequence] Execute async task failed.", err?.message ?? err);
                }
            });
        });
    }

    async runWithTimeout(tasks, timeoutMs) {
        this.#addTasks(tasks);

        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                this.#hasTimeout = true;
                resolve({ status: "timeout", message: "Timeout has occurred. Main process continues; task moved to background." });
            }, timeoutMs);

            this.#chain.then(() => {
                if (!this.#hasTimeout) {
                    clearTimeout(timer);
                    resolve({ status: "success", message: "All tasks have been completed in sequence." });
                }
            });
        });
    }
}

export async function executeAsyncTaskChain(tasks, timeoutMs) {
    return new AsyncSequence().runWithTimeout(tasks, timeoutMs)
}