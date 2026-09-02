import fs from 'fs';
import iconv from 'iconv-lite';
import clashConst from '../constants/clashFileNameConst.js';
import { getSubscribeInfo } from './clashSubscribeService.js';

/**
 * @typedef {import('#types/clashTypes.d.ts').ClashFileContentResult} ClashFileContentResult
 */

/**
 * 读取指定名称的 Clash 配置文件正文与订阅响应头
 * @param {string} [fileName=clashConst.LATEST_FILE_NAME] - 目标文件名 (如 latest.yaml, latest-tailscale.yaml)
 * @returns {Promise<ClashFileContentResult>} 包含 headers 与 UTF-8 文本内容
 * @throws {object} 文件不存在或读取异常时抛出错误
 */
export async function getClashFileContent(fileName = clashConst.LATEST_FILE_NAME) {
    const persistencePath = __env.get('clash.path.persistence', '@/');
    const filePath = __join(persistencePath, fileName);
    if (fs.existsSync(filePath)) {
        const result = {
            headers: {},
            content: null
        };
        const subInfo = getSubscribeInfo();
        if (!__isBlank(subInfo)) {
            result.headers['subscription-userinfo'] = subInfo;
        }
        try {
            const data = fs.readFileSync(filePath);
            const buf = Buffer.from(data);
            result.content = iconv.decode(buf, 'utf8');
            return result;
        } catch (err) {
            __log.error('Read clash config file failed.', err);
            __throwMessage('Read clash config file failed.', -1, 500);
        }
    } else {
        __throwMessage('Read clash config file failed.', -1, 404);
    }
}