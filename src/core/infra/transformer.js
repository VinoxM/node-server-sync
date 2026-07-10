import { pipeline } from '@xenova/transformers';
import path from 'path';
import { ContextSubscribe } from '../context/subscribe.js';

class EmbedTransformer extends ContextSubscribe {
    static instance = new EmbedTransformer();

    #modelsPath;
    #extractor = null;
    constructor() {
        super('EmbedTransformer', async () => this.#initialize(true), true)
    }

    async #initialize(force = false) {
        this.doSubscribe()
        if (this.#extractor === null || force) {
            this.#modelsPath = __env.get('vector.model.path', path.join(__dirname, './models'))
            const cacheDir = this.#modelsPath;
            this.#extractor = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
                local_files_only: true,
                cache_dir: cacheDir
            });
        }
    }

    async extract(text) {
        await this.#initialize();
        const output = await this.#extractor(text, {
            pooling: 'mean',
            normalize: true,
        });
        return Array.from(output.data);
    }
}

export const embedTransformer = EmbedTransformer.instance;