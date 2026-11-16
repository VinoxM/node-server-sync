import { pushNotification } from "#api/sockets/notification.js";
import { crawlerBrowser } from "#core/instance/crawlerBrowser.js";
import { checkVideoFilterRules } from "#modules/media/service/mediaFilterService.js";
import { getCrawlPushNotificationWithCover, getEnableCrawlPushNotification } from "#modules/media/service/mediaOptionsService.js";
import { checkVideoCanAdd, createVideo } from "#modules/media/service/mediaVideoService.js";
import { getCanAdd, getDownload, getInfo, getTags } from "./callback.js";

const CATEGORY = 'Hanime1';
const BASE_URL = 'https://hanimeone.me';

export async function flushHanime1() {
    const flshURLSet = new Set();
    const flushPaths = [
        '/search?sort=%E6%9C%80%E6%96%B0%E4%B8%8A%E5%82%B3', // 最新上傳
        '/search?sort=%E6%9C%80%E6%96%B0%E4%B8%8A%E5%B8%82', // 最新上市
    ]
    flushPaths.push(...__env.get('crawl.hanime1.flushPath', []));
    flushPaths.forEach(url => {
        const fullURL = buildFullUrl(BASE_URL, url);
        fullURL && flshURLSet.add(fullURL);
    });
    const flushURLs = Array.from(flshURLSet);
    if (__isEmptyArray(flushURLs)) {
        __log.warn(`[Crawl Hanime1] No pull URL available.`);
        return;
    }
    const ignoreAuthorExists = __env.get('crawl.hanime1.ignoreAuthorExists', false);
    const prepared = new Map();
    for (const flushURL of flushURLs) {
        const rules = await crawlerBrowser.openURL(flushURL, getCanAdd);
        if (!rules) continue;
        const result = await checkVideoFilterRules({ category: CATEGORY, rules });
        if (result && Array.isArray(result)) {
            for (let i = 0; i < result.length; i++) {
                const { canAdd, downloaded, authorExists } = result[i];
                canAdd && !downloaded && (ignoreAuthorExists || authorExists) && prepared.set(rules[i].uniqueId, rules[i]);
            }
        }
    }
    if (prepared.size === 0) return;
    __log.info(`[Crawl Hanime1] Get can add videos:`, prepared.size);
    const toSave = new Map();
    const skipInside = __env.get('crawl.hanime1.skipInside', false);
    const skipDance = __env.get('crawl.hanime1.skipDance', false);
    for (const { uniqueId } of prepared.values()) {
        const fullURL = buildFullUrl(BASE_URL, `/watch?v=${uniqueId}`);
        const info = await crawlerBrowser.openURL(fullURL, getInfo, { callbackArgs: [skipInside, skipDance] });
        if (!info) continue;
        const { urlList, author, playlist } = info;
        for (const { href, id } of urlList) {
            const { canAdd } = await checkVideoCanAdd({ category: CATEGORY, author, uniqueId: id });
            if (!canAdd) continue;
            const downloadUrl = href.replaceAll(/watch/g, 'download')
            const download = await crawlerBrowser.openURL(downloadUrl, getDownload);
            if (!download) continue;
            const { title, cover, href: downloadHref } = download;
            const tags = await crawlerBrowser.openURL(href, getTags);
            const pushObj = {
                uniqueId: id,
                title: title.replace(`[${author}]`, "").trim(),
                category: CATEGORY,
                author,
                uploadTime: new Date(),
                tags,
                source: downloadHref,
                cover,
                playlistTitle: playlist
            }
            toSave.set(id, pushObj);
        }
    }
    if (toSave.size === 0) {
        __log.info(`[Crawl Hanime1] No need to create videos found.`);
        return;
    }
    const enablePush = await getEnableCrawlPushNotification();
    const withCover = await getCrawlPushNotificationWithCover();
    const videos = Array.from(toSave.values());
    const created = [];
    for (const videoObj of videos) {
        const flag = await tryCreateVideo(videoObj);
        if (flag) {
            const createdObj = { author: videoObj.author, title: videoObj.title };
            withCover && (createdObj.cover = videoObj.cover);
            created.push(createdObj);
        }
    }
    if (created.length > 0 && enablePush) {
        __log.info(`[Crawl Hanime1] Created videos:`, created.length);
        await pushNotification({
            event: 'media-crawl',
            title: 'Hanime1 视频抓取入库',
            message: `成功抓取并入库 ${created.length} 部新视频`,
            extra: {
                source: 'hanime1',
                action: 'created',
                count: created.length,
                videos: created
            }
        }, 'CrawlService');
    }
}

async function tryCreateVideo(video) {
    try {
        const { id } = await createVideo(video);
        return id;
    } catch (e) {
        __log.error(`[Crawl Hanime1] Try create video[${video.author} - ${video.title}] failed.`, e.message ?? e);
        return null;
    }
}

/**
 * 全面处理 baseURL、动态 path 和 query 的拼接
 * @param {string} baseURL - 基础域名，例如 'https://example.com' 或 'https://example.com/api/'
 * @param {string} dynamicPath - 动态读取的路径，例如 '/users' 或 'users?tab=1'
 * @param {Object|string} [queryConfig] - 动态读取的查询参数（支持对象或字符串）
 * @returns {string} 完整的安全 URL
 */
function buildFullUrl(baseURL, dynamicPath = '', queryConfig = null) {
  try {
    // 1. 利用 new URL 的特性，自动合并 baseURL 和 dynamicPath
    // 即使 dynamicPath 包含或不包含斜杠，或者自带了 query，它都能正确处理
    const url = new URL(dynamicPath, baseURL);

    // 2. 处理额外的动态 Query 参数
    if (queryConfig) {
      if (typeof queryConfig === 'string') {
        // 如果配成的是字符串形式（如 "foo=bar&baz=1" 或 "?foo=bar"）
        const cleanQuery = queryConfig.startsWith('?') ? queryConfig.slice(1) : queryConfig;
        const additionalParams = new URLSearchParams(cleanQuery);
        for (const [key, value] of additionalParams) {
          url.searchParams.append(key, value);
        }
      } else if (typeof queryConfig === 'object' && queryConfig !== null) {
        // 如果配成的是对象形式
        for (const [key, value] of Object.entries(queryConfig)) {
          // 过滤掉 undefined 或 null 的无效配置
          if (value !== undefined && value !== null) {
            url.searchParams.append(key, value);
          }
        }
      }
    }

    return url.toString();
  } catch {
    return null;
  }
}