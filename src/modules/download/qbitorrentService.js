import axios from 'axios';
import FormData from 'form-data';
import { join } from 'path';
import { generateUUID } from '../../common/utils/cryptoUtil.js';
import * as qbitStateConsts from './constants/qbitStateConst.js';
import { GetterContextSubscribe } from '../../core/context/subscribe.js';

const qbitOption = new GetterContextSubscribe("QBit Option", () => {
    const qbitRpc = __env.get('qbit.rpc', {})
    const host = qbitRpc?.host ?? '192.168.31.120'
    const port = qbitRpc?.port ?? '9801'
    const savePath = qbitRpc?.savePath ?? '/mnt/media/Downloads'
    return {
        url: `http://${host}:${port}`,
        savePath
    }
})

const getQBitUrl = () => qbitOption?.getValue()?.url ?? 'http://192.168.31.120:9801';
const getQBitDownloadPath = () => qbitOption?.getValue()?.savePath ?? '/mnt/media/Downloads';

const qbitApi = {
    addTorrent: '/api/v2/torrents/add',
    torrentInfo: '/api/v2/torrents/info',
    torrentFiles: '/api/v2/torrents/files',
    deleteTorrent: '/api/v2/torrents/delete',
    deleteTags: '/api/v2/torrents/deleteTags',
    stopTorrent: '/api/v2/torrents/stop',
    startTorrent: '/api/v2/torrents/start',
}

function generateQueryTag(uuid) {
    return `query:${uuid}`
}

export function getUUIDByTorrentInfo(torrentInfo) {
    const tags = torrentInfo.tags
    const tag = String(tags).split(',')[0]
    return tag.replace('query:', '')
}

async function postQbitApi(urlPath, data) {
    const form = new FormData();
    Object.keys(data).forEach(k => form.append(k, data[k]))
    const addResponse = await axios.post(`${getQBitUrl()}${urlPath}`, form, {
        headers: {
            ...form.getHeaders()
        }
    });
    return addResponse.data
}

async function getQbitApi(urlPath, params) {
    const addResponse = await axios.get(`${getQBitUrl()}${urlPath}`, { params });
    return addResponse.data
}

export async function addTorrent(torrent, savePath = 'Anime', category = 'Anime') {
    if (typeof torrent !== 'string') {
        __throwMessage('Invalid torrent.')
    }
    const qbitDownloadPath = getQBitDownloadPath()
    const uuid = generateUUID()
    const addResponse = await postQbitApi(qbitApi.addTorrent, {
        urls: torrent,
        savepath: join(qbitDownloadPath, savePath),
        isPaused: 'false',
        tags: generateQueryTag(uuid),
        category
    })
    if (addResponse === 'Ok.') {
        __log.info('qbitorrent task added.');
        return new Promise(resolve => {
            setTimeout(() => {
                torrentInfo(uuid).then(info => info !== null ? resolve(info) : resolve({ uuid }))
                    .catch(() => resolve({ uuid }))
            }, 1000)
        })
    } else {
        __log.error('add qbitorrent task failed.', addResponse);
        __throwMessage('add qbitorrent task failed.')
    }
}

export async function torrentInfo(uuid, hash) {
    let torrents = null
    if (uuid) {
        torrents = await getQbitApi(qbitApi.torrentInfo, { tag: generateQueryTag(uuid) })
    } else if (hash) {
        torrents = await getQbitApi(qbitApi.torrentInfo, { hashes: hash })
    }
    return torrents && Array.isArray(torrents) ? torrents[0] : null
}

export async function torrentFiles(hash) {
    return await getQbitApi(qbitApi.torrentFiles, { hash })
}

export async function deleteTag(uuid) {
    return await postQbitApi(qbitApi.deleteTags, { tags: generateQueryTag(uuid) })
}

export async function deleteTorrent(hash, deleteFile = false) {
    return await postQbitApi(qbitApi.deleteTorrent, { hashes: hash, deleteFiles: String(deleteFile) })
}

export async function torrentsInfo(hashes) {
    return await getQbitApi(qbitApi.torrentInfo, { hashes: Array.from(hashes).join("|") })
}

export function generateTorrentState(info) {
    const state = info.state
    return Object.keys(qbitStateConsts).find(s => {
        const stateConsts = qbitStateConsts[s]
        return Object.keys(stateConsts).includes(state)
    }) ?? 'UNKNOWN'
}

export async function stopTorrent(hashes) {
    return await postQbitApi(qbitApi.stopTorrent, { hashes: Array.from(hashes).join("|") })
}

export async function startTorrent(hashes) {
    return await postQbitApi(qbitApi.startTorrent, { hashes: Array.from(hashes).join("|") })
}