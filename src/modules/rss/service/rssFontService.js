import path, { join } from "path"
import { getMinioClient } from "../../../core/instance/minioClient.js";
import { copyRemoteFileToMinio } from "../../ssh/sshExecutorService.js";
import rssFontsRep from "../repository/rssFontsRep.js";

async function uploadFileToMinio(resourcePath, minioLink) {
    const client = getMinioClient()
    if (!client?.ready()) {
        __log.warn(`Upload font minio object failed. Cause client not ready.`)
        return -1
    }
    const suitableMinioLink = client.generateSuitableMinioLink(minioLink);
    return await copyRemoteFileToMinio(resourcePath, suitableMinioLink);
}

export function matchSubtitleFont(fontName, extractFonts = []) {
    const font = String(fontName).toLocaleLowerCase()
    const result = extractFonts.find(extract => {
        const family = extract.family ? String(extract.family).toLocaleLowerCase() : ''
        const familyWithStyle = extract.style ? (family + ' ' + String(extract.style).toLocaleLowerCase()) : ''
        const fullName = extract.fullName ? String(extract.fullName).toLocaleLowerCase() : ''
        const postScriptName = extract.postScriptName ? String(extract.postScriptName).toLocaleLowerCase() : ''
        return [family, familyWithStyle, fullName, postScriptName].includes(font)
    })
    if (!result) {
        return null;
    }
    return {
        file: result.file,
        fontName: result.family
    }
}

export async function insertFont(fontName, fontFile, fontRootPath) {
    const ext = path.extname(fontFile)
    const fontFullPath = join(fontRootPath, fontFile)
    const minioLink = `/fonts/${fontName}${ext}`
    const id = await rssFontsRep.insertOne(fontName, minioLink)
    if (id) {
        const code = await uploadFileToMinio(fontFullPath, minioLink)
        if (code !== 0) {
            await rssFontsRep.deleteOne(id)
            return false;
        }
    }
    return true;
}