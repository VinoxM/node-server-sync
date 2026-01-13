import axios from 'axios';
import FormData from 'form-data';
import { join } from 'path';

const QB_URL = 'http://fedora:9801';

export async function addTorrent(torrents, savePath = 'Anime') {
    if (!Array.isArray(torrents)) torrents = [torrents]
    torrents = torrents.join('\n')
    const form = new FormData();
    form.append('urls', torrents);
    form.append('savepath', join('/shared_media/Downloads', savePath));
    form.append('isPaused', 'false');

    const addResponse = await axios.post(`${QB_URL}/api/v2/torrents/add`, form, {
        headers: {
            ...form.getHeaders()
        }
    });

    if (addResponse.data === 'Ok.') {
        __log.info('qbitorrent task added.');
    } else {
        __log.error('add qbitorrent task failed.', addResponse.data);
        throwMessage('add qbitorrent task failed.')
    }
}