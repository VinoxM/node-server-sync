import { defineSSEChannel } from '#utils/defineUtil.js';

/**
 * 实时弹幕推送 SSE 频道 (`?channel=barrage`)
 */
export default defineSSEChannel({
    channel: 'barrage',
    validator: (req, clients) => {
        const query = req.query;
        const uname = query?.uname;
        return typeof uname === 'string' && __isNotBlank(uname) && !Array.from(clients['barrage'] ?? []).some(c => c.getUname() === uname);
    },
    onConnected: client => {
        client.sendMessage("Welcome.");
    },
    onConfigurationRefreshed: client => {
        client.sendMessage('Configuration refreshed.');
    },
    onDisconnected: () => {
    }
});