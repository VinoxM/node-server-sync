import { ContextSubscribe } from "../context/subscribe.js";
import * as Minio from 'minio';
import { evaluate } from "mathjs";

const defaultExpiry = 2 * 60 * 60;

/**
 * MinIO 对象存储客户端多实例管理器 (单例模式)
 * 支持配置多集群 Client、按路径正则分发路由标签、生成临时预签名分享链接以及文件 CRUD 操作
 */
class MinioClient extends ContextSubscribe {
    /** @type {MinioClient} 单例实例 */
    static instance = new MinioClient();

    /** @type {boolean} 是否已初始化完毕 */
    #initialized = false;

    /** @type {Map<string, Minio.Client>} 实例标签到 MinIO Client 的映射字典 */
    #client = new Map();

    /** @type {string} 默认 Client 标签名称 */
    #defaultLabel = 'default';

    /** @type {Map<string, { expiry: number, defaultBucket: string }>} 实例额外配置项 (预签名有效期、默认桶) */
    #clientOptions = new Map();

    /** @type {Map<string, { matcher: string, hostname?: string }>} 路径正则匹配器与域名配置 */
    #clientMatchers = new Map();

    /** @type {Map<string, string>} 资源分类到 Bucket 的映射字典 */
    #categoryBucketMapping = new Map();

    constructor() {
        super('Minio', () => this.initialize(), true);
    }

    /**
     * 清理所有已加载的 Client 与映射缓存
     */
    #clean() {
        this.#client?.clear();
        this.#clientOptions?.clear();
        this.#clientMatchers?.clear();
        this.#categoryBucketMapping?.clear();
        this.#initialized = false;
    }

    /**
     * 从全局环境配置初始化全部 MinIO 客户端实例
     */
    initialize() {
        this.#clean();
        const minioOption = __env.get('minio', {});
        if (__isEmptyArray(minioOption.clients)) {
            return;
        }
        this.#defaultLabel = minioOption.defaultLabel ?? 'default';
        for (const minioOpt of minioOption.clients) {
            const label = minioOpt.label ?? this.#defaultLabel;
            const { matcher = '*', expiry = '2 * 60 * 60', defaultBucket = 'default', bucketMapping = [], host, port, hostname } = minioOpt;
            const options = {
                endPoint: host,
                port,
                useSSL: false,
                accessKey: minioOpt.username,
                secretKey: minioOpt.password
            };
            try {
                const client = new Minio.Client(options);
                bucketMapping.forEach(({ bucket, category = [] }) => category?.forEach(c => this.#categoryBucketMapping.set(c, bucket)));
                this.#clientOptions.set(label, { expiry: tryEvaluateExpiry(expiry, label), defaultBucket });
                this.#clientMatchers.set(label, { matcher, hostname });
                this.#client.set(label, client);
                __log.info(`[Minio] Minio client ready: ${label}.`);
            } catch (ex) {
                __log.error(`[Minio] Minio client connect failed: ${label}.`, ex.message ?? ex);
            }
        }
        this.#initialized = true;
    }

    /**
     * 获取是否就绪可用
     * @returns {boolean}
     */
    ready() {
        return this.#initialized;
    }

    /**
     * 校验指定标签的 Client 是否可用
     * @param {string} [label=this.#defaultLabel] - Client 标签
     * @returns {boolean}
     */
    #clientReady(label = this.#defaultLabel) {
        return this.#client.get(label) !== null;
    }

    /**
     * 根据 MinIO 资源链接匹配适用的 MinIO Client 标签
     * @param {string} minioLink - 资源路径链接
     * @returns {string} 匹配命中的 Client 标签
     */
    #getSuitableMinioLabel(minioLink) {
        for (const [label, opt] of this.#clientMatchers) {
            const matcher = opt?.matcher;
            if (tryMatch(matcher, minioLink, label)) {
                return label;
            }
        }
        return this.#defaultLabel;
    }

    /**
     * 获取当前注册的所有 Client 匹配器字典
     * @returns {Record<string, { matcher: string, hostname?: string }>}
     */
    getMinioMatchers() {
        return Object.fromEntries(this.#clientMatchers.entries());
    }

    /**
     * 根据分类获取对应的 MinIO 存储桶名称
     * @param {string} category - 资源分类名
     * @returns {string|undefined} 目标 Bucket 名称
     */
    generateSuitableMinioBucket(category) {
        if (this.#categoryBucketMapping.has(category)) {
            return this.#categoryBucketMapping.get(category);
        }
        return this.#clientOptions.get(this.#defaultLabel)?.defaultBucket;
    }

    /**
     * 为资源路径添加匹配的 Client 标签前缀
     * @param {string} minioLink - 原始资源路径
     * @returns {string} 格式如 `label/bucket/object` 的完整链接
     */
    generateSuitableMinioLink(minioLink) {
        const label = this.#getSuitableMinioLabel(minioLink);
        const separator = String(minioLink).startsWith('/') ? '' : '/';
        return `${label}${separator}${minioLink}`;
    }

    /**
     * 生成对象的预签名访问/下载临时分享链接 (Presigned URL)
     * @param {string} minioLink - 格式如 `bucket/objectName` 的资源链接
     * @param {(err: any, label: string) => void} [errorCallback] - 异常回调
     * @returns {Promise<string|null>} 预签名访问 URL
     */
    async generateShareLink(minioLink, errorCallback) {
        let result = null;
        const label = this.#getSuitableMinioLabel(minioLink);
        try {
            this.#clientReady(label) || __throwMessage(`Minio not ready.`);
            const { bucket, objectName } = splitMinioLink(minioLink);
            const expiry = this.#clientOptions.get(label)?.expiry ?? defaultExpiry;
            result = await this.#client.get(label).presignedGetObject(bucket, objectName, expiry);
        } catch (ex) {
            if (__isFunction(errorCallback)) {
                errorCallback(ex, label);
            } else {
                throw ex;
            }
        }
        return result;
    }

    /**
     * 获取 MinIO 对象的元数据状态信息 (Stat)
     * @param {string} minioLink - 资源链接
     * @param {(err: any, label: string) => void} [errorCallback] - 异常回调
     * @returns {Promise<Minio.BucketItemStat|null>}
     */
    async getObjectStat(minioLink, errorCallback) {
        const label = this.#getSuitableMinioLabel(minioLink);
        try {
            this.#clientReady(label) || __throwMessage(`Minio not ready.`);
            const { bucket, objectName } = splitMinioLink(minioLink);
            return await this.#client.get(label).statObject(bucket, objectName);
        } catch (ex) {
            if (__isFunction(errorCallback)) {
                errorCallback(ex, label);
            } else {
                throw ex;
            }
        }
        return null;
    }

    /**
     * 从 MinIO 中删除指定对象
     * @param {string} minioLink - 资源链接
     * @param {(err: any, label: string) => void} [errorCallback] - 异常回调
     * @returns {Promise<boolean>} 是否删除成功
     */
    async deleteObject(minioLink, errorCallback) {
        const label = this.#getSuitableMinioLabel(minioLink);
        try {
            this.#clientReady(label) || __throwMessage(`Minio not ready.`);
            const { bucket, objectName } = splitMinioLink(minioLink);
            await this.#client.get(label).removeObject(bucket, objectName);
            return true;
        } catch (ex) {
            if (__isFunction(errorCallback)) {
                errorCallback(ex, label);
            } else {
                throw ex;
            }
        }
        return false;
    }

    /**
     * 获取 MinIO 对象的可读流 (ReadableStream)
     * @param {string} minioLink - 资源链接
     * @param {(err: any, label: string) => void} [errorCallback] - 异常回调
     * @returns {Promise<import('stream').Readable|null>}
     */
    async getObject(minioLink, errorCallback) {
        const label = this.#getSuitableMinioLabel(minioLink);
        try {
            this.#clientReady(label) || __throwMessage(`Minio not ready.`);
            const { bucket, objectName } = splitMinioLink(minioLink);
            return await this.#client.get(label).getObject(bucket, objectName);
        } catch (ex) {
            if (__isFunction(errorCallback)) {
                errorCallback(ex, label);
            } else {
                throw ex;
            }
        }
        return null;
    }

    /**
     * 上传二进制 Buffer 文件对象至 MinIO
     * @param {string} minioLink - 目标资源链接 (格式: bucket/objectName)
     * @param {Buffer} bufferContent - 二进制 Buffer 内容
     * @param {Record<string, any>} [metaData={}] - 附加元数据 (如 Content-Type)
     * @param {(err: any, label: string) => void} [errorCallback] - 异常回调
     * @returns {Promise<Minio.UploadedObjectInfo|null>}
     */
    async putObject(minioLink, bufferContent, metaData = {}, errorCallback) {
        if (!(bufferContent instanceof Buffer)) return null;
        const bufferLength = bufferContent.length;
        const label = this.#getSuitableMinioLabel(minioLink);
        try {
            this.#clientReady(label) || __throwMessage(`Minio not ready.`);
            const { bucket, objectName } = splitMinioLink(minioLink);
            return await this.#client.get(label).putObject(bucket, objectName, bufferContent, bufferLength, metaData);
        } catch (ex) {
            if (__isFunction(errorCallback)) {
                errorCallback(ex, label);
            } else {
                throw ex;
            }
        }
        return null;
    }
}

/**
 * 尝试解析有效期表达式（如 '2 * 60 * 60'）
 * @param {string|number} expiry - 表达式或数字
 * @param {string} label - 标签
 * @returns {number} 过期秒数
 */
function tryEvaluateExpiry(expiry, label) {
    try {
        if (Number.isInteger(expiry)) {
            return expiry;
        }
        return evaluate(expiry);
    } catch (ex) {
        __log.error(`[Minio] Evaluate ${label}'s minio expiry: ${expiry} failed.`, ex?.message ?? ex);
        return defaultExpiry;
    }
}

/**
 * 执行正则匹配
 * @param {string} matcher - 正则表达式字符串
 * @param {string} text - 目标文本
 * @param {string} label - Client 标签
 * @returns {boolean}
 */
function tryMatch(matcher, text, label) {
    if (__isBlank(matcher)) {
        return false;
    }
    try {
        return new RegExp(matcher).test(text);
    } catch (ex) {
        __log.error(`[Minio] Execute ${label} minio matcher: ${matcher} failed.`, ex?.message ?? ex);
        return false;
    }
}

/**
 * 解析 MinIO 路径字符串，拆分为 bucket 与 objectName
 * @param {string} minioLink - 格式如 `/bucket/path/to/file.jpg`
 * @returns {{ bucket: string, objectName: string }}
 */
export function splitMinioLink(minioLink) {
    let link = String(minioLink);
    if (link.startsWith('/')) {
        link = link.slice(1);
    }
    const index = link.indexOf('/');
    index === -1 && __throwMessage(`Invalid minio link: ${minioLink}`);
    const bucket = link.substring(0, index);
    const objectName = link.substring(index + 1);
    return { bucket, objectName };
}

/**
 * 获取全局 MinIO 客户端管理器单例
 * @returns {MinioClient}
 */
export function getMinioClient() {
    initializeMinioClient();
    return MinioClient.instance;
}

/**
 * 确保 MinIO 客户端管理器已初始化
 */
export function initializeMinioClient() {
    const instance = MinioClient.instance;
    if (!instance.ready()) {
        instance.initialize();
    }
}