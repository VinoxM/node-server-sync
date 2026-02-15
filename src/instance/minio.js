import { ContextSubcribe } from "../context/subscribe.js";
import * as Minio from 'minio';

export class MinioClient extends ContextSubcribe {

    #client = null

    constructor() {
        super('Minio', () => this.#initialize())
        this.#initialize()
    }

    #initialize() {
        const minioOpt = __env.get('minio', null)
        if (minioOpt === null) {
            this.#client = null
            return
        }
        const options = {
            endPoint: minioOpt.host,
            port: minioOpt.port,
            useSSL: false,
            accessKey: minioOpt.username,
            secretKey: minioOpt.password
        }
        this.#client = new Minio.Client(options)
    }

    ready() {
        return this.#client !== null
    }

    async generateShareLink(bucket, objectName) {
        if (!this.ready()) return Promise.resolve(null);
        const expiry = __env.get('minio.expiry', 2 * 60 * 60)
        return this.#client.presignedGetObject(bucket, objectName, expiry)
    }

    async deleteObject(bucket, objectName) {
        if (!this.ready()) return Promise.reject('Minio not ready.');
        return this.#client.removeObject(bucket, objectName)
    }
}