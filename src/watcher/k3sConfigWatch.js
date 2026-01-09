import { Worker } from 'worker_threads';
import { reloadApplicationContext } from '../support/index.js';
import yaml from 'yaml';
import { pushNotification } from '../sockets/notification.js';

export function initK3SConfigurationWatcher() {
    const enabled = __env?.get('k3s.watch.enabled', false)
    if (!enabled) return
    const watcherWorker = new Worker(__join('@/src/watcher', 'k3sWatchWorker.js'));
    watcherWorker.on('message', (message) => {
        if (message.event === 'CONFIG_UPDATED') {
            logger(`[K3S Configuration Watcher] Configuration changed.`);
            const label = 'application-k3s-secret.yaml'
            const data = yaml.parse(message.data[label])
            reloadApplicationContext(['k3s-secret'], [{ data, label }])
            const message = {
                event: 'log',
                message: `[K3S Configuration Watcher] Configuration changed: ${label}.`
            }
            pushNotification(JSON.stringify(message))
        }
    });
    logger(`[K3S Configuration Watcher] Initialized watcher.`);
}