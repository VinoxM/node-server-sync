import axios from 'axios';
import FormData from 'form-data';
import { join } from 'path';
import { generateUUID } from "#utils/cryptoUtil.js";
import * as qbitStateConsts from './constants/qbitStateConst.js';
import { GetterContextSubscribe } from "#core/context/subscribe.js";

/**
 * @typedef {import('@types/downloadTypes.d.ts').QBitTorrentInfo} QBitTorrentInfo
 * @typedef {import('@types/downloadTypes.d.ts').QBitTorrentFile} QBitTorrentFile
 * @typedef {import('@types/downloadTypes.d.ts').QBitTorrentGroupState} QBitTorrentGroupState
 */

/** @type {GetterContextSubscribe<{ url: string, savePath: string }>} 动态订阅 qBittorrent 配置 */
const qbitOption = new GetterContextSubscribe("QBit Option", () => {
    const qbitRpc = __env.get('qbit.rpc', {});
    const host = qbitRpc?.host ?? '192.168.31.120';
    const port = qbitRpc?.port ?? '9801';
    const savePath = qbitRpc?.savePath ?? '/mnt/media/Downloads';
    return {
        url: `http://${host}:${port}`,
        savePath
    };
});

/** 获取当前 qBittorrent WebUI API 地址 */
const getQBitUrl = () => qbitOption?.getValue()?.url ?? 'http://192.168.31.120:9801';

/** 获取当前 qBittorrent 默认下载保存根路径 */
const getQBitDownloadPath = () => qbitOption?.getValue()?.savePath ?? '/mnt/media/Downloads';

/** qBittorrent Web API 端点常量定义 */
const qbitApi = {
    addTorrent: '/api/v2/torrents/add',
    torrentInfo: '/api/v2/torrents/info',
    torrentFiles: '/api/v2/torrents/files',
    deleteTorrent: '/api/v2/torrents/delete',
    deleteTags: '/api/v2/torrents/deleteTags',
    stopTorrent: '/api/v2/torrents/stop',
    startTorrent: '/api/v2/torrents/start'
};

/**
 * 根据 UUID 生成用于检索关联的 Query Tag
 * @param {string} uuid
 * @returns {string}
 */
function generateQueryTag(uuid) {
    return `query:${uuid}`;
}

/**
 * 从 Torrent 详情的 tags 字段中反向提取关联业务的 UUID
 * @param {QBitTorrentInfo} torrentInfo - 种子详情
 * @returns {string} UUID 字符串
 */
export function getUUIDByTorrentInfo(torrentInfo) {
    const tags = torrentInfo.tags;
    const tag = String(tags).split(',')[0];
    return tag.replace('query:', '');
}

/**
 * 向 qBittorrent 发送 POST 请求 (基于 multipart/form-data)
 * @param {string} urlPath - API 路径
 * @param {Record<string, any>} data - 请求表单参数
 * @returns {Promise<any>}
 */
async function postQbitApi(urlPath, data) {
    const form = new FormData();
    Object.keys(data).forEach(k => form.append(k, data[k]));
    const addResponse = await axios.post(`${getQBitUrl()}${urlPath}`, form, {
        headers: {
            ...form.getHeaders()
        }
    });
    return addResponse.data;
}

/**
 * 向 qBittorrent 发送 GET 请求
 * @param {string} urlPath - API 路径
 * @param {Record<string, any>} [params] - 查询参数
 * @returns {Promise<any>}
 */
async function getQbitApi(urlPath, params) {
    const addResponse = await axios.get(`${getQBitUrl()}${urlPath}`, { params });
    return addResponse.data;
}

/**
 * 添加一个磁力链接或种子下载任务
 * @param {string} torrent - 磁力链接 (Magnet URI) 或 HTTP 下载链接
 * @param {string} [savePath='Anime'] - 相对存储子目录
 * @param {string} [category='Anime'] - 分类名称
 * @returns {Promise<QBitTorrentInfo|{ uuid: string }>} 成功添加后返回初始 Torrent 详情或包含 tag UUID 的对象
 */
export async function addTorrent(torrent, savePath = 'Anime', category = 'Anime') {
    if (typeof torrent !== 'string') {
        __throwMessage('Invalid torrent.');
    }
    const qbitDownloadPath = getQBitDownloadPath();
    const uuid = generateUUID();
    const addResponse = await postQbitApi(qbitApi.addTorrent, {
        urls: torrent,
        savepath: join(qbitDownloadPath, savePath),
        isPaused: 'false',
        tags: generateQueryTag(uuid),
        category
    });
    if (addResponse === 'Ok.') {
        __log.info('qbitorrent task added.');
        return new Promise(resolve => {
            setTimeout(() => {
                torrentInfo(uuid).then(info => info !== null ? resolve(info) : resolve({ uuid }))
                    .catch(() => resolve({ uuid }));
            }, 1000);
        });
    } else {
        __log.error('add qbitorrent task failed.', addResponse);
        __throwMessage('add qbitorrent task failed.');
    }
}

/**
 * 根据标签 UUID 或 InfoHash 精确查询单个 Torrent 任务信息
 * @param {string} [uuid] - 业务关联 UUID (通过 tag 查询)
 * @param {string} [hash] - 种子 Hash
 * @returns {Promise<QBitTorrentInfo|null>}
 */
export async function torrentInfo(uuid, hash) {
    let torrents = null;
    if (uuid) {
        torrents = await getQbitApi(qbitApi.torrentInfo, { tag: generateQueryTag(uuid) });
    } else if (hash) {
        torrents = await getQbitApi(qbitApi.torrentInfo, { hashes: hash });
    }
    return torrents && Array.isArray(torrents) ? torrents[0] : null;
}

/**
 * 获取指定种子内部包含的所有文件列表与下载进度
 * @param {string} hash - 种子 Hash
 * @returns {Promise<QBitTorrentFile[]>} 文件列表
 */
export async function torrentFiles(hash) {
    return await getQbitApi(qbitApi.torrentFiles, { hash });
}

/**
 * 清理指定 UUID 的查询 Tag 标签
 * @param {string} uuid - 业务 UUID
 * @returns {Promise<any>}
 */
export async function deleteTag(uuid) {
    return await postQbitApi(qbitApi.deleteTags, { tags: generateQueryTag(uuid) });
}

/**
 * 删除指定的 Torrent 任务
 * @param {string} hash - 种子 Hash
 * @param {boolean} [deleteFile=false] - 是否同时删除本地已下载的文件数据
 * @returns {Promise<any>}
 */
export async function deleteTorrent(hash, deleteFile = false) {
    return await postQbitApi(qbitApi.deleteTorrent, { hashes: hash, deleteFiles: String(deleteFile) });
}

/**
 * 批量查询多个 InfoHash 对应的 Torrent 任务信息列表
 * @param {string[]|Set<string>} hashes - Hash 集合
 * @returns {Promise<QBitTorrentInfo[]>}
 */
export async function torrentsInfo(hashes) {
    return await getQbitApi(qbitApi.torrentInfo, { hashes: Array.from(hashes).join("|") });
}

/**
 * 根据 Torrent 的细分状态码映射归类为大类状态枚举 (如 DOWNLOADING, SEEDING, COMPLETE 等)
 * @param {QBitTorrentInfo} info - 种子详情
 * @returns {QBitTorrentGroupState} 状态大类
 */
export function generateTorrentState(info) {
    const state = info?.state;
    return Object.keys(qbitStateConsts).find(s => {
        const stateConsts = qbitStateConsts[s];
        return Object.keys(stateConsts).includes(state);
    }) ?? 'UNKNOWN';
}

/**
 * 批量停止/暂停指定的 Torrent 任务
 * @param {string[]|Set<string>} hashes - Hash 集合
 * @returns {Promise<any>}
 */
export async function stopTorrent(hashes) {
    return await postQbitApi(qbitApi.stopTorrent, { hashes: Array.from(hashes).join("|") });
}

/**
 * 批量启动/恢复指定的 Torrent 任务
 * @param {string[]|Set<string>} hashes - Hash 集合
 * @returns {Promise<any>}
 */
export async function startTorrent(hashes) {
    return await postQbitApi(qbitApi.startTorrent, { hashes: Array.from(hashes).join("|") });
}