import { pipeline } from '@xenova/transformers';

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    cache_dir: '/models'
});