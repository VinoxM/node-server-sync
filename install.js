import { pipeline, env } from '@xenova/transformers';
import path from 'path'

env.allowRemoteModels = true;
env.remoteHost = 'https://hf-mirror.com';

async function download() {
    console.log("正在从国内镜像站下载模型...");

    // 执行下载
    await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', {
        cache_dir: path.resolve('/models')
    });

    console.log("模型成功下载到本地 /models 目录！");
}

download();