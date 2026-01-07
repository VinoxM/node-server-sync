import fs from 'fs';
import path from 'path';

export const SSLCertFiles = ["vinoxm.fun.key", "vinoxm.fun_bundle.crt"]

export const updateSSLCert = (files) => {
    const sslPath = '/etc/nginx'
    const sslBackupPath = path.join(sslPath, 'ssl-backup')
    if (!fs.existsSync(sslBackupPath)) {
        fs.mkdirSync(sslBackupPath, { recursive: true })
    }
    const timestamp = new Date().getTime()
    for (const file of files) {
        const fileName = SSLCertFiles.find(f => f === file.field)
        if (fileName) {
            fs.renameSync(path.join(sslPath, fileName), path.join(sslBackupPath, timestamp + '-' + fileName))
            fs.writeFileSync(path.join(sslPath, fileName), Buffer.from(file.data))
        }
    }
}