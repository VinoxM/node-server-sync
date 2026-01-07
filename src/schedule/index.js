import nodeSchedule from 'node-schedule';
import { importFolderScripts } from '../common/configUtil.js';

class Schedule {
    #schedule = {};
    constructor() {
    }

    addJob(scheduleConfig) {
        const { scheduleKey, jobName, defaultCorn, jobCallback, ignoreOutput, retry, immediate } = scheduleConfig;
        if (isBlank(scheduleKey) || isBlank(jobName) || isBlank(defaultCorn) || !jobCallback) return;
        const scheduleCorn = getScheduleConfig();
        if (!scheduleCorn[scheduleKey]?.enable) return;
        const resolve = () => (!ignoreOutput && logger(`[Schedule] Job Finished: ${jobName}.`));
        const reject = (ex, errCallback) => (error(`[Schedule] Job Execute error: ${jobName}. Cause: ${ex.msg || ex.message}`), isFunction(errCallback) && errCallback());
        const executeJob = () => {            
            const doJob = (errCallback) => {
                try {
                    const jobCall = jobCallback();
                    if (isPromise(jobCall)) {
                        jobCall.then(resolve).catch(err => reject(err, errCallback))
                    } else {
                        resolve();
                    }
                } catch (err) {
                    reject(err, errCallback);
                }
            }
            let tryHandle = doJob;
            if (retry) {
                let retryCount = retry.maxCount ?? 3;
                let interval = retry.interval ?? 1000 * 30;
                tryHandle = (delay = 0) => {
                    retryCount--;
                    if (retryCount < 0) return;
                    setTimeout(() => {
                        doJob(() => tryHandle(interval));
                    }, delay);
                }
            }
            tryHandle();
        }
        this.#schedule[scheduleKey] = {
            name: jobName,
            job: nodeSchedule.scheduleJob(scheduleCorn[scheduleKey]?.corn || defaultCorn, () => {
                !ignoreOutput && logger(`[Schedule] Job Execute: ${jobName}`);
                executeJob();
            })
        }
        logger(`[Schedule] Job Added: ${jobName}`);
        if (immediate || scheduleCorn[scheduleKey]?.immediate) {
            executeJob();
        }
    }

    cancelJob(scheduleKey) {
        if (!this.#schedule.hasOwnProperty(scheduleKey)) {
            throwMessage(`No such Job ${scheduleKey}`);
        }
        const schedule = this.#schedule[scheduleKey];
        if (schedule?.job) {
            schedule.job.cancel();
            schedule.job = null;
        }
        Reflect.deleteProperty(this.#schedule, scheduleKey);
        logger(`[Schedule] Job Cancel: ${schedule?.name || 'unknown jobName'}`);
    }

    cancelAllJob() {
        Object.keys(this.#schedule).forEach(scheduleKey => {
            const schedule = this.#schedule[scheduleKey];
            if (schedule?.job) {
                schedule.job.cancel();
                schedule.job = null;
            }
            logger(`[Schedule] Job Cancel: ${schedule?.name || 'unknown jobName'}`);
        })
        this.#schedule = {};
    }
}

const getScheduleConfig = () => __env.get('schedule', {})

let scheduleInstance = null;

const startSchedule = () => {
    if (scheduleInstance) {
        scheduleInstance.cancelAllJob();
    } else {
        scheduleInstance = new Schedule();
    }
    return importFolderScripts("@/src/schedule", false, module => {
        scheduleInstance.addJob(module.default)
    })
}

const cancelJob = (scheduleKey) => {
    if (scheduleInstance) {
        scheduleInstance.cancelJob(scheduleKey);
    }
}

export {
    startSchedule,
    cancelJob
}