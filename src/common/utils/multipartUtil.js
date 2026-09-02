import { StringDecoder } from 'string_decoder';

/**
 * 解析 multipart/form-data 二进制数据流
 * @param {Buffer} buffer - 原始请求体 Buffer 数据
 * @param {string} boundary - multipart 请求头中的 boundary 分隔标识
 * @returns {{
 *   files: Array<{
 *     field: string,
 *     originalname: string,
 *     mimetype: string,
 *     size: number,
 *     data: Buffer
 *   }>,
 *   fields: Record<string, string>
 * }} 解析出的文件列表与普通字段键值对对象
 */
export function parseMultipart(buffer, boundary) {
    const parts = buffer.toString('binary').split(`--${boundary}`);
    const fields = {};
    const files = [];
    const decoder = new StringDecoder('utf8');
    parts.forEach((part) => {
        if (!part || part === '--\r\n') return;

        const headersEnd = part.indexOf('\r\n\r\n');
        if (headersEnd === -1) return;

        const headers = part.substring(0, headersEnd + 2);
        const content = part.substring(headersEnd + 4);

        const contentDisposition = headers.match(/Content-Disposition:.*?name="([^"]+)"/i);
        if (!contentDisposition) return;

        const fieldName = contentDisposition[1];
        const filenameMatch = headers.match(/filename="([^"]+)"/i);

        if (filenameMatch) {
            const filename = filenameMatch[1];
            const contentTypeMatch = headers.match(/Content-Type: (.*)\r\n/i);
            const contentType = contentTypeMatch ? contentTypeMatch[1] : 'application/octet-stream';
            const contentData = Buffer.from(content, 'binary')
            files.push({
                field: fieldName,
                originalname: filename,
                mimetype: contentType,
                size: contentData.length,
                data: contentData
            })
        } else {
            fields[fieldName] = decoder.write(Buffer.from(content, 'binary')).trim();
        }
    });
    return { files, fields }
}