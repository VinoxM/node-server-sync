import { StringDecoder } from 'string_decoder';

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