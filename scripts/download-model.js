/**
 * 本地模型下载脚本。
 *
 * 用法:
 *   node scripts/download-model.js <模型名> [task] [缓存目录]
 *
 * 示例:
 *   node scripts/download-model.js Xenova/opus-mt-ja-zh translation
 *   node scripts/download-model.js Xenova/bge-m3 feature-extraction
 */
import { pipeline, env } from '@xenova/transformers';
import path from 'path';
import { fileURLToPath } from 'url';

const rootPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const modelName = process.argv[2] ?? 'Xenova/opus-mt-ja-zh';
const task = process.argv[3] ?? 'translation';
const cacheDir = path.resolve(rootPath, process.argv[4] ?? 'models');

env.allowRemoteModels = true;

console.log(`[download-model] task=${task} model='${modelName}' -> ${cacheDir}`);

const extractor = await pipeline(task, modelName, {
    cache_dir: cacheDir,
    local_files_only: false,
});

console.log(`[download-model] Model ready: '${modelName}'`);
await extractor.dispose?.();
process.exit(0);
