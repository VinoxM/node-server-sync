import { importFolderScripts } from "../common/configUtil.js";
import { storeConnection, getConnections } from "../handler/socket/socketHandler.js";

export async function getSocketChannels() {
    const disabledSockets = Array.from(__env.get("socket.disabled", []))
    return importFolderScripts("@/src/sockets", true, (module, name) => {
        disabledSockets.includes(name) || storeConnection(module.default)
    }).then(() => getConnections())
}