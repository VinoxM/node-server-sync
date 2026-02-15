import { setupGlobal } from './support.js';
import { join } from 'path';
import { startServer, setupSocketChannels } from './api/index.js';
import { startTokenBucket } from './common/apiTokenBucket.js';
import { startIpBlocker } from './common/apiIpBlock.js';
import { startSchedule } from './schedule/index.js';
import { getSocketChannels } from './sockets/index.js';
import { initializeAuthTokenStore } from './handler/account/authHandler.js';
import { sseInitialization } from './sse/index.js';

(async () => {
    await setupGlobal(join(import.meta.dirname, "../"));
    initializeAuthTokenStore();
    await startServer();
    await getSocketChannels().then(setupSocketChannels);
    sseInitialization();
    startTokenBucket();
    startIpBlocker();
    startSchedule();
})();