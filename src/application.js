import { setupGlobal } from './support.js';
import { join } from 'path';
import { startServer } from './api/index.js';
import { startSchedule } from './jobs/schedule/index.js';
import { aria2SocketInitialize } from './core/instance/aria2Socket.js';
import { sseInitialize } from './modules/socket/sseStorage.js';
import { initializeAuthTokenStore } from './modules/authorization/authorizationService.js';
import { ipBlocker } from './core/instance/ipBlocker.js';
import { tokenBucket } from './core/instance/tokenBucket.js';

(async () => {
    await setupGlobal(join(import.meta.dirname, "../"));
    initializeAuthTokenStore();
    await startServer();
    aria2SocketInitialize();
    sseInitialize();
    ipBlocker.start();
    tokenBucket.start();
    startSchedule();
})();