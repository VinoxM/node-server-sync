import axios from 'axios';
import { join } from 'path';
import { generateUUID } from '../common/stringUtil.js';

const RPC_URL = 'http://frp:6800/jsonrpc';
const RPC_SECRET = 'mAou5820';

export async function addTorrent(torrents, savePath = 'Anime') {
    if (!Array.isArray(torrents)) torrents = [torrents]
    const options = {
        dir: join('/shared_media/Downloads', savePath)
    }
    const requestData = {
        jsonrpc: '2.0',
        id: `node_${generateUUID()}`,
        method: 'aria2.addUri',
        params: [
            `token:${RPC_SECRET}`,
            torrents,
            options
        ]
    };

    const addResponse = await axios.post(RPC_URL, requestData);

    if (addResponse.data.error) {
        error('add qbitorrent task failed.', addResponse.data);
        throwMessage('add qbitorrent task failed.')
    } else {
        const gid = addResponse.data.result;
        logger(`qbitorrent task added. GID: ${gid}`);
        return gid
    }
}