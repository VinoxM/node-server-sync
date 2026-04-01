import { ContextSubscribe } from "../context/subscribe.js";
import * as Minio from 'minio';
import { evaluate } from "mathjs";

const defaultExpiry = 2 * 60 * 60

class MinioClient extends ContextSubscribe {

    static instance = new MinioClient()

    #initialized = false;
    #client = new Map();
    #defaultLabel = 'default';

    #clientOptions = new Map();
    #clientMatchers = new Map();
    #categoryBucketMapping = new Map();

    constructor() {
        super('Minio', () => this.initialize(), true)
    }

    #clean() {
        this.#client?.clear();
        this.#clientOptions?.clear();
        this.#clientMatchers?.clear();
        this.#categoryBucketMapping?.clear();
        this.#initialized = false;
    }

    initialize() {
        this.#clean()
        const minioOption = __env.get('minio', {})
        if (__isEmptyArray(minioOption.clients)) {
            return
        }
        this.#defaultLabel = minioOption.defaultLabel ?? 'default'
        for (const minioOpt of minioOption.clients) {
            const label = minioOpt.label ?? this.#defaultLabel
            const { matcher = '*', expiry = '2 * 60 * 60', defaultBucket = 'default', bucketMapping = [], host, port, hostname } = minioOpt
            const options = {
                endPoint: host,
                port,
                useSSL: false,
                accessKey: minioOpt.username,
                secretKey: minioOpt.password
            }
            try {
                const client = new Minio.Client(options)
                bucketMapping.forEach(({ bucket, category = [] }) => category?.forEach(c => this.#categoryBucketMapping.set(c, { label, bucket })))
                this.#clientOptions.set(label, { expiry: tryEvaluateExpiry(expiry, label), defaultBucket })
                this.#clientMatchers.set(label, { matcher, hostname })
                this.#client.set(label, client)
                __log.info(`[Minio] Minio client ready: ${label}.`)
            } catch (ex) {
                __log.error(`[Minio] Minio client connect failed: ${label}.`, ex.message ?? ex)
            }
        }
        this.#initialized = true
    }

    ready() {
        return this.#initialized
    }

    #clientReady(label = this.#defaultLabel) {
        return this.#client.get(label) !== null
    }

    #getSuitableMinioLabel(minioLink) {
        for (const [label, opt] of this.#clientOptions) {
            const matcher = opt?.matcher
            if (tryMatch(matcher, minioLink, label)) {
                return label
            }
        }
        return this.#defaultLabel
    }

    getMinioMatchers() {
        return Object.fromEntries(this.#clientMatchers.entries())
    }

    generateSuitableMinioBucket(category) {
        if (this.#categoryBucketMapping.has(category)) {
            return this.#categoryBucketMapping.get(category)
        }
        return this.#clientOptions.get(this.#defaultLabel)?.defaultBucket
    }

    generateSuitableMinioLink(minioLink) {
        const label = this.#getSuitableMinioLabel(minioLink)
        return `${label}/${minioLink}`
    }

    async generateShareLink(minioLink, errorCallback) {
        let result = null
        const label = this.#getSuitableMinioLabel(minioLink)
        try {
            this.#clientReady(label) || __throwMessage(`Minio not ready.`)
            const { bucket, objectName } = splitMinioLink(minioLink)
            const expiry = this.#clientOptions.get(label)?.expiry ?? defaultExpiry
            result = await this.#client.get(label).presignedGetObject(bucket, objectName, expiry)
        } catch (ex) {
            if (__isFunction(errorCallback)) {
                errorCallback(ex, label)
            } else {
                throw ex
            }
        }
        return result
    }

    async deleteObject(minioLink, errorCallback) {
        let result = null
        const label = this.#getSuitableMinioLabel(minioLink)
        try {
            this.#clientReady(label) || __throwMessage(`Minio not ready.`)
            const { bucket, objectName } = splitMinioLink(minioLink)
            result = await this.#client.get(label).removeObject(bucket, objectName)
        } catch (ex) {
            if (__isFunction(errorCallback)) {
                errorCallback(ex, label)
            } else {
                throw ex
            }
        }
        return result
    }
}

function tryEvaluateExpiry(expiry, label) {
    try {
        if (Number.isInteger(expiry)) {
            return expiry;
        }
        return evaluate(expiry)
    } catch (ex) {
        __log.error(`[Minio] Evaluate ${label}'s minio expiry: ${expiry} failed.`, ex?.message ?? ex)
        return defaultExpiry
    }
}

function tryMatch(matcher, text, label) {
    if (__isBlank(matcher)) {
        return false;
    }
    try {
        return new RegExp(matcher).test(text)
    } catch (ex) {
        __log.error(`[Minio] Execute ${label} minio matcher: ${matcher} failed.`, ex?.message ?? ex)
        return false
    }
}

function splitMinioLink(minioLink) {
    let link = String(minioLink)
    if (link.startsWith('/')) {
        link = link.slice(1)
    }
    const index = link.indexOf('/')
    index === -1 && __throwMessage(`Invalid minio link: ${minioLink}`)
    const bucket = link.substring(0, index)
    const objectName = link.substring(index + 1)
    return { bucket, objectName }
}

export function getMinioClient() {
    initializeMinioClient()
    return MinioClient.instance
}

export function initializeMinioClient() {
    const instance = MinioClient.instance;
    if (!instance.ready()) {
        instance.initialize()
    }
}