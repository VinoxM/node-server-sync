import { Worker } from 'worker_threads';
import { reloadApplicationContext } from '../support/index.js';
import yaml from 'yaml';

export function initK3SConfigurationWatcher() {
    const enabled = __env?.get('k3s.watch.enabled', false)
    if (!enabled) return
    const watcherWorker = new Worker(__join('@/src/watcher', 'k3sWatchWorker.js'));
    watcherWorker.on('message', (message) => {
        if (message.event === 'CONFIG_UPDATED') {
            logger(`[K3S Configuration Watcher] Configuration changed.`);
            console.log(message.data)
            reloadApplicationContext(['k3s-secret'], yaml.parse(message.data))
        }
    });
    logger(`[K3S Configuration Watcher] Initialized watcher.`);
}