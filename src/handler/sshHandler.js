import { ContextSubscribe } from "../context/subscribe.js"
import { SSHExecutor } from "../instance/sshExecutor.js"

const sshExecutorPool = new Map()

const sshSubscribe = new ContextSubscribe('SSH', async () => {
    const disconnects = [];
    sshExecutorPool.forEach(executor => {
        if (executor) disconnects.push(executor.disconnect());
    });
    await Promise.allSettled(disconnects);
    sshExecutorPool.clear();
}, true)

export function getExecutor(label = '') {
    if (!label) return null
    sshSubscribe.doSubscribe()
    if (sshExecutorPool.has(label)) {
        return sshExecutorPool.get(label)
    }
    const configKey = `ssh.${label}`
    const sshConfig = __env.get(configKey)
    if (!sshConfig) return null
    const executor = new SSHExecutor(sshConfig, label, {
        idleTimeout: 300000,
        onDestroy: (lbl) => {
            if (sshExecutorPool.has(lbl)) {
                sshExecutorPool.delete(lbl);
                __log.log(`[${lbl}] Pool auto-cleanup: entry removed.`);
            }
        }
    })
    sshExecutorPool.set(label, executor)
    return executor
}