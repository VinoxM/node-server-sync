import fs from 'fs';
import iconv from 'iconv-lite';
import clashConst from '../constants/clashFileNameConst.js';
import { getSubscribeInfo } from './clashSubscribeService.js';

export async function getClashFileContent(fileName = clashConst.LATEST_FILE_NAME) {
    const persistencePath = __env.get('clash.path.persistence', '@/')
    const filePath = __join(persistencePath, fileName);
    if (fs.existsSync(filePath)) {
        const result = {
            headers: {},
            content: null
        }
        const subInfo = getSubscribeInfo()
        if (!__isBlank(subInfo)) {
            result.headers['subscription-userinfo'] = subInfo
        }
        try {
            const data = fs.readFileSync(filePath)
            const buf = Buffer.from(data);
            result.content = iconv.decode(buf, 'utf8');
            return result;
        } catch (err) {
            __log.error('Read clash config file failed.', err)
            __throwMessage('Read clash config file failed.', -1, 500)
        }
    } else {
        __throwMessage('Read clash config file failed.', -1, 404)
    }
}