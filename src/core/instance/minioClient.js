import { ContextSubscribe } from "../context/subscribe.js";
import * as Minio from 'minio';
import { evaluate } from "mathjs";

const defaultExpiry = 2 * 60 * 60

class MinioClient extends ContextSubscribe {

    static instance = new MinioClient()

    #initialized = false;
    #client = new Map();
    #options = new Map();
    #defaultLabel = 'default';
    #bucketMapping = new Map();

    constructor() {
        super('Minio', () => this.initialize(), true)
    }

    #clean() {
        this.#client?.clear();
        this.#options?.clear();
        this.#bucketMapping?.clear();
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
            const { matcher = '*', expiry = '2 * 60 * 60', defaultBucket = 'default', bucketMapping = [], host, port } = minioOpt
            const options = {
                endPoint: host,
                port,
                useSSL: false,
                accessKey: minioOpt.username,
                secretKey: minioOpt.password
            }
            try {
                bucketMapping.forEach(({ bucket, category }) => this.#bucketMapping.set(bucket, { category, defaultBucket, host, port }))
                const client = new Minio.Client(options)
                this.#client.set(label, client)
                this.#options.set(label, { matcher, expiry: tryEvaluateExpiry(expiry, label), host, port })
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
        for (const [label, opt] of this.#options) {
            const matcher = opt?.matcher
            if (tryMatch(matcher, minioLink, label)) {
                return label
            }
        }
        return this.#defaultLabel
    }

    getMinioDefaultLabel() {
        return this.#defaultLabel;
    }

    getMinioBucketMappings() {
        return Object.fromEntries(this.#bucketMapping.entries())
    }

    getMinioMatchers() {
        return Object.fromEntries(this.#options.entries())
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
            const expiry = this.#options.get(label)?.expiry ?? defaultExpiry
            result = this.#client.get(label).presignedGetObject(bucket, objectName, expiry)
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
            result = this.#client.get(label).removeObject(bucket, objectName)
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