export default {
    channel: 'barrage',
    validator: (req, clients) => {
        const query = req.query
        const uname = query.uname
        return __isNotBlank(uname) && !Array.from(clients['barrage'] ?? []).some(c => c.getUname() === uname)
    },
    onConnected: client => {
        client.sendMessage("Welcome.")
    },
    onConfigurationRefreshed: client => {
        client.sendMessage('Configuration refreshed.')
    },
    onDisconnected: () => {
    }
}