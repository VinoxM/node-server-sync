import path, { join } from "path";
import { getMinioClient } from "#core/instance/minioClient.js";
import { copyRemoteFileToMinio } from "#modules/ssh/sshExecutorService.js";
import rssFontsRep from "#modules/anime/repository/rss/rssFontsRep.js";

async function uploadFileToMinio(resourcePath, minioLink) {
    const client = getMinioClient();
    if (!client?.ready()) {
        __log.warn(`Upload font minio object failed. Cause client not ready.`);
        return -1;
    }
    const suitableMinioLink = client.generateSuitableMinioLink(minioLink);
    return await copyRemoteFileToMinio(resourcePath, suitableMinioLink);
}

/**
 * 在提取到的字体列表中模糊匹配字幕缺失的目标字体
 * @param {string} fontName - 目标字体名称
 * @param {Array<{ family?: string, style?: string, fullName?: string, postScriptName?: string, file: string }>} [extractFonts=[]] - 提取出的字体信息列表
 * @returns {{ file: string, fontName: string }|null}
 */
export function matchSubtitleFont(fontName, extractFonts = []) {
    const font = String(fontName).toLocaleLowerCase();
    const result = extractFonts.find(extract => {
        const family = extract.family ? String(extract.family).toLocaleLowerCase() : '';
        const familyWithStyle = extract.style ? (family + ' ' + String(extract.style).toLocaleLowerCase()) : '';
        const fullName = extract.fullName ? String(extract.fullName).toLocaleLowerCase() : '';
        const postScriptName = extract.postScriptName ? String(extract.postScriptName).toLocaleLowerCase() : '';
        return [family, familyWithStyle, fullName, postScriptName].includes(font);
    });
    if (!result) {
        return null;
    }
    return {
        file: result.file,
        fontName: result.family
    };
}

/**
 * 将字幕内嵌字体保存并同步至 MinIO 字体库
 * @param {string} fontName - 字体族名称
 * @param {string} fontFile - 字体相对文件名
 * @param {string} fontRootPath - 字体本地所在根目录
 * @returns {Promise<boolean>}
 */
export async function insertFont(fontName, fontFile, fontRootPath) {
    const ext = path.extname(fontFile);
    const fontFullPath = join(fontRootPath, fontFile);
    const minioLink = `/fonts/${fontName}${ext}`;
    const id = await rssFontsRep.insertOne(fontName, minioLink);
    if (id) {
        const code = await uploadFileToMinio(fontFullPath, minioLink);
        if (code !== 0) {
            await rssFontsRep.deleteOne(id);
            return false;
        }
    }
    return true;
}