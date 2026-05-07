import { getExecutorSnapshot, SSE_EVENT } from "../../core/instance/sshExecutor.js";

export default {
    channel: 'executor',
    validator: (req, clients) => {
        const query = req.query
        const uname = query.uname
        return __isNotBlank(uname) && !Array.from(clients['executor'] ?? []).some(c => c.getUname() === uname)
    },
    onConnected: (client, query) => {
        const label = query.label
        if (__isBlank(label)) {
            client.emitEvent("message:error", 'Executor label is blank.');
            client.close();
            return;
        }
        const snapshot = getExecutorSnapshot(label) || {}

        __log.info(snapshot)
        
        const { ready = false, pendingCount = 0, taskSnapshot = {} } = snapshot

        client.emitEvent(ready ? SSE_EVENT.READY : SSE_EVENT.DESTROY);

        client.emitEvent(SSE_EVENT.PENDING_UPDATE, pendingCount);

        const std = taskSnapshot?.std || [];
        if (!Array.isArray(std) || std.length === 0) return;
        const desc = taskSnapshot?.desc || 'Unknown';
        client.emitEvent(SSE_EVENT.EXEC_START, desc);
        for (const { chunk, isError } of std) {
            client.emitEvent(isError ? SSE_EVENT.STDERR : SSE_EVENT.STDOUT, chunk);
        }
    },
    onDisconnected: () => {
    }
}