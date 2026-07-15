import { pipeline, env } from '@xenova/transformers';
import path from 'path';
import { ContextSubscribe } from '../context/subscribe.js';

const EMBED_MODEL = 'Xenova/bge-m3'

class EmbedTransformer extends ContextSubscribe {
    static instance = new EmbedTransformer();

    #modelsPath;
    #extractor = null;
    #lastPromise = Promise.resolve();
    constructor() {
        super('EmbedTransformer', async () => this.initialize(true), true)
    }

    async initialize(force = false) {
        this.doSubscribe()
        if (this.#extractor === null || force) {
            // env.allowRemoteModels = true;
            // env.remoteHost = 'https://hf-mirror.com';
            const modelsPath = __env.get('vector.model.path', path.join(__dirname, './models'))
            if (this.#extractor !== null && modelsPath === this.#modelsPath) {
                return;
            }
            this.#modelsPath = modelsPath;
            const cacheDir = this.#modelsPath;
            this.#extractor = await pipeline('feature-extraction', EMBED_MODEL, {
                local_files_only: true,
                cache_dir: cacheDir
            });
            __log.info(`[EmbedTransformer] Initialized model:`, EMBED_MODEL)
        }
    }

    async extract(text) {
        const currentPromise = this.#lastPromise.then(async () => {
            __log.info(`[EmbedTransformer] Ready to extract text:`, text)
            await this.initialize();
            const output = await this.#extractor(text, {
                pooling: 'mean',
                normalize: true,
            });
            return Array.from(output.data);
        });

        // 链式排队，确保同时最多只有一个 extract 在执行
        this.#lastPromise = currentPromise.catch(() => { });
        return currentPromise;
    }

    #packBgeM3ToBQBuffer(embedding = []) {
        // 1. 计算这 1024 维向量的平均值
        const sum = embedding.reduce((acc, val) => acc + val, 0);
        const mean = sum / embedding.length;

        // 2. 映射到一个同样长度的 0/1 数组
        return embedding.map(val => {
            // 减去均值后再与 0 比较
            // 大于均值返回 1，小于等于均值返回 0
            return (val - mean) > 0 ? 1 : 0;
        });
    }
}

export const embedTransformer = EmbedTransformer.instance;