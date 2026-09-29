import { pushNotification } from "#api/sockets/notification.js";
import { crawlerBrowser } from "#core/instance/crawlerBrowser.js";
import { checkVideoFilterRules } from "#modules/media/service/mediaFilterService.js";
import { checkVideoCanAdd, createVideo } from "#modules/media/service/mediaVideoService.js";
import { getCanAdd, getDownload, getInfo, getTags } from "./callback.js";

const CATEGORY = 'Hanime1';
const BASE_URL = 'https://hanimeone.me';

export async function flushHanime1() {
    const rules = await crawlerBrowser.openURL(BASE_URL + '/search', getCanAdd);
    const result = await checkVideoFilterRules({ category: CATEGORY, rules });
    const prepared = [];
    if (result && Array.isArray(result)) {
        for (let i = 0; i < result.length; i++) {
            const { canAdd, downloaded } = result[i];
            canAdd && !downloaded && prepared.push(rules[i]);
        }
    }
    if (prepared.length === 0) return;
    __log.info(`[Crawl Hanime1] Get can add videos:`, prepared.length);
    const toSave = new Map();
    for (const { uniqueId } of prepared) {
        const info = await crawlerBrowser.openURL(BASE_URL + `/watch?v=${uniqueId}`, getInfo);
        const { urlList, author, playlist } = info;
        for (const { href, id } of urlList) {
            const canAdd = await checkVideoCanAdd({ category: CATEGORY, author, uniqueId: id });
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
    const videos = Array.from(toSave.values());
    const created = [];
    for (const videoObj of videos) {
        const flag = await tryCreateVideo(videoObj);
        flag && created.push({ author: videoObj.author, title: videoObj.title });
    }
    if (created.length > 0) {
        __log.info(`[Crawl Hanime1] Created videos:`, created.length);
        await pushNotification(JSON.stringify({ event: 'Crawl', data: created }));
    }
}

async function tryCreateVideo(video) {
    try {
        const { id } = await createVideo(videoObj);
        return id;
    } catch (e) {
        __log.error(`[Crawl Hanime1] Try create video[${video.author} - ${video.title}] failed.`, e.message ?? e);
        return null;
    }
}