import { setupGlobal } from './support/index.js';
import { join } from 'path';
import { startServer, setupSocketChannels } from './api/index.js';
import { startTokenBucket } from './common/apiTokenBucket.js';
import { startIpBlocker } from './common/apiIpBlock.js';
import { startSchedule } from './schedule/index.js';
import { getSocketChannels } from './sockets/index.js';
import { initK3SConfigurationWatcher } from './watcher/k3sConfigWatch.js';

(async () => {
    await setupGlobal(join(import.meta.dirname, "../"));
    await startServer();
    await getSocketChannels().then(setupSocketChannels);
    startTokenBucket();
    startIpBlocker();
    startSchedule();
    initK3SConfigurationWatcher();
})();