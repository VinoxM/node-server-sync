import { ContextSubscribe } from "../context/subscribe.js";
import * as Minio from 'minio';

class MinioClient extends ContextSubscribe {

    static instance = new MinioClient()

    #client = null

    constructor() {
        super('Minio', () => this.initialize(), true)
    }

    initialize() {
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
        if (!this.ready()) return Promise.reject('Minio not ready.');
        const expiry = __env.get('minio.expiry', 2 * 60 * 60)
        return this.#client.presignedGetObject(bucket, objectName, expiry)
    }

    async deleteObject(bucket, objectName) {
        if (!this.ready()) return Promise.reject('Minio not ready.');
        return this.#client.removeObject(bucket, objectName)
    }
}

export function getMinioClient() {
    const instance = MinioClient.instance;
    if (!instance.ready()) {
        instance.initialize()
    }
    return instance
}