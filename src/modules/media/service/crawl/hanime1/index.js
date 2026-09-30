import { pushNotification } from "#api/sockets/notification.js";
import { crawlerBrowser } from "#core/instance/crawlerBrowser.js";
import { checkVideoFilterRules } from "#modules/media/service/mediaFilterService.js";
import { getCrawlPushNotificationWithCover } from "#modules/media/service/mediaOptionsService.js";
import { checkVideoCanAdd, createVideo } from "#modules/media/service/mediaVideoService.js";
import { getCanAdd, getDownload, getInfo, getTags } from "./callback.js";

const CATEGORY = 'Hanime1';
const BASE_URL = 'https://hanimeone.me';

export async function flushHanime1() {
    const flushURLs = [
        '/search?sort=%E6%9C%80%E6%96%B0%E4%B8%8A%E5%82%B3', // 最新上傳
        '/search?sort=%E6%9C%80%E6%96%B0%E4%B8%8A%E5%B8%82', // 最新上市
    ]
    const prepared = new Map();
    for (const flushURL of flushURLs) {
        const rules = await crawlerBrowser.openURL(BASE_URL + flushURL, getCanAdd);
        if (!rules) continue;
        const result = await checkVideoFilterRules({ category: CATEGORY, rules });
        if (result && Array.isArray(result)) {
            for (let i = 0; i < result.length; i++) {
                const { canAdd, downloaded } = result[i];
                canAdd && !downloaded && prepared.set(rules[i].uniqueId, rules[i]);
            }
        }
    }
    if (prepared.size === 0) return;
    __log.info(`[Crawl Hanime1] Get can add videos:`, prepared.size);
    const toSave = new Map();
    for (const { uniqueId } of prepared.values()) {
        const info = await crawlerBrowser.openURL(BASE_URL + `/watch?v=${uniqueId}`, getInfo);
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
    if (created.length > 0) {
        __log.info(`[Crawl Hanime1] Created videos:`, created.length);
        await pushNotification(JSON.stringify({ event: 'Crawl', data: created }));
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