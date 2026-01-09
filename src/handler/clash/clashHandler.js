import fs from 'fs';
import iconv from 'iconv-lite';
import clashConst from '../../constraints/clashFileNameConst.js';
import { getSubscribeInfo } from './clashSubscribeHandler.js';

const latestClashFileName = clashConst.LATEST_FILE_NAME

export const getClashFileContent = () => {
    return new Promise((resolve, reject) => {
        const persistencePath = __env.get('clash.path.persistence', '@/')
        const filePath = __join(persistencePath, latestClashFileName);
        if (fs.existsSync(filePath)) {
            const result = {
                headers: {},
                content: null
            }
            const subInfo = getSubscribeInfo()
            if (!isBlank(subInfo)) {
                result.headers['subscription-userinfo'] = subInfo
            }
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    const buf = Buffer.from(data);
                    result.content = iconv.decode(buf, 'utf8');
                    resolve(result);
                }
            })
        } else {
            reject({ msg: 'Clash config file not found.' })
        }
    })
}