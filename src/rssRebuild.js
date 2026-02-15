import fs from 'fs'
import path from 'path';

export async function rebuild() {
    const rssSubscribe = await fillRssSubscribe()
    const rssTracker = await fillRssTracker()
    const rssResult = await fillRssResult(rssSubscribe, rssTracker)
    generateRssResultSql(rssResult)
    const rssLink = await fillRssLink(rssSubscribe)
    generateRssLinkSql(rssLink)
    const rssCopyright = await fillRssCopyright(rssSubscribe)
    generateRssCopyrightSql(rssCopyright)
}

function fillNullable(v) {
    if (v === null) {
        return 'NULL'
    }
    if (typeof v === 'number') {
        return v
    }
    return `'${String(v).replaceAll(/'/g, "''")}'`
}

async function fillRssSubscribe() {
    const db = sqliteDB;
    const rssSubscribe = []
    const generateSql = (id) => `SELECT ID,name,name_jp,url,regex,season,start_time,cover,fin,is_short,anime_type,goon,staff,"cast",origin_type,type_tag,broadcast FROM rss_subscribe WHERE ID > ${id ?? 0} LIMIT 1000;`
    let rows = 1;
    while (rows > 0) {
        let id = rssSubscribe.at(-1)?.id ?? 0;
        const sql = generateSql(id)
        let result = await db.selectAll(sql, [], null, 'rss')
        rows = result.rows
        rssSubscribe.push(...result.data)
    }
    await generateRssSubscribeSql(rssSubscribe)
    const resultMap = new Map()
    rssSubscribe.forEach((v, i) => {
        resultMap.set(v.id, i + 1)
    })
    return resultMap
}

async function generateRssSubscribeSql(rssSubscribe) {
    const array = Array.from(rssSubscribe)
    let result = ''
    for (let i = 0; i < array.length; i += 10) {
        const arr = array.slice(i, i + 10);
        if (arr.length === 0) continue
        let insert = `INSERT INTO rss_subscribe (name,name_jp,url,regex,season,start_time,cover,fin,is_short,anime_type,goon,staff,"cast",origin_type,type_tag,broadcast) VALUES\n`
        let values = arr.map(r => '(' + [
            fillNullable(r.name),
            fillNullable(r.nameJp),
            fillNullable(r.url),
            fillNullable(r.regex),
            fillNullable(r.season),
            fillNullable(r.startTime),
            fillNullable(r.cover),
            fillNullable(r.fin),
            fillNullable(r.isShort),
            fillNullable(r.animeType),
            fillNullable(r.goon),
            fillNullable(r.staff),
            fillNullable(r.cast),
            fillNullable(r.originType),
            fillNullable(r.typeTag),
            fillNullable(r.broadcast)
        ].join(',') + ")").join(',\n')
        result += insert + values + ';\n'
    }
    fs.writeFileSync('/home/maou/.github/node-server/resource/script_rebuild/rss_subscribe.sql', result)
}

async function fillRssTracker() {
    const db = sqliteDB;
    const rssTracker = []
    const generateSql = (id) => `SELECT ID FROM rss_tracker WHERE ID > ${id ?? 0} LIMIT 1000;`
    let rows = 1;
    while (rows > 0) {
        let id = rssTracker.at(-1)?.id ?? 0;
        const sql = generateSql(id)
        let result = await db.selectAll(sql, [], null, 'rss')
        rows = result.rows
        rssTracker.push(...result.data)
    }
    const resultMap = new Map()
    rssTracker.forEach((v, i) => {
        resultMap.set(v.id, i + 1)
    })
    return resultMap
}

async function fillRssResult(rssSubscribe, rssTracker) {
    const db = sqliteDB;
    const rssResult = []
    const generateSql = (id) => `SELECT id,pid,title,torrent,pub_date,hide,tracker,episode,up_date,sort FROM rss_result WHERE ID > ${id ?? 0} LIMIT 1000;`
    let rows = 1;
    while (rows > 0) {
        let id = rssResult.at(-1)?.id ?? 0;
        const sql = generateSql(id)
        let result = await db.selectAll(sql, [], null, 'rss')
        rows = result.rows
        rssResult.push(...result.data.map(r => {
            let pid = r.pid
            pid = rssSubscribe.get(pid)
            let trackers = r.tracker ?? ''
            trackers = trackers.split(',').map(t => rssTracker.get(Number(t))).join(',')
            return {
                ...r,
                pid,
                tracker: trackers
            }
        }))
    }
    return rssResult
}

async function generateRssResultSql(rssResult) {
    const array = Array.from(rssResult)
    let result = ''
    for (let i = 0; i < array.length; i += 10) {
        const arr = array.slice(i, i + 10);
        if (arr.length === 0) continue
        let insert = `INSERT INTO rss_result (pid,title,torrent,pub_date,hide,tracker,episode,up_date,sort) VALUES\n`
        let values = arr.map(r => '(' + [
            fillNullable(r.pid),
            fillNullable(r.title),
            fillNullable(r.torrent),
            fillNullable(r.pubDate),
            fillNullable(r.hide),
            fillNullable(r.tracker),
            fillNullable(r.episode),
            fillNullable(r.upDate),
            fillNullable(r.sort)
        ].join(',') + ")").join(',\n')
        result += insert + values + ';\n'
    }
    fs.writeFileSync('/home/maou/.github/node-server/resource/script_rebuild/rss_result.sql', result)
}

async function fillRssLink(rssSubscribe) {
    const db = sqliteDB;
    const rssLink = []
    const generateSql = (id) => `SELECT id,pid,title,href FROM rss_link WHERE ID > ${id ?? 0} LIMIT 1000;`
    let rows = 1;
    while (rows > 0) {
        let id = rssLink.at(-1)?.id ?? 0;
        const sql = generateSql(id)
        let result = await db.selectAll(sql, [], null, 'rss')
        rows = result.rows
        rssLink.push(...result.data.map(r => {
            let pid = r.pid
            pid = rssSubscribe.get(pid)
            return {
                ...r,
                pid
            }
        }).filter(r => !!r.pid))
    }
    return rssLink
}

async function generateRssLinkSql(rssLink) {
    const array = Array.from(rssLink)
    let result = ''
    for (let i = 0; i < array.length; i += 10) {
        const arr = array.slice(i, i + 10);
        if (arr.length === 0) continue
        let insert = `INSERT INTO rss_link (pid,title,href) VALUES\n`
        let values = arr.map(r => `(${r.pid},'${r.title}','${r.href}')`)
            .join(',\n')
        result += insert + values + ';\n'
    }
    fs.writeFileSync('/home/maou/.github/node-server/resource/script_rebuild/rss_link.sql', result)
}

async function fillRssCopyright(rssSubscribe) {
    const db = sqliteDB;
    const rssCopyright = []
    const generateSql = (id) => `SELECT id,pid,area,href,image FROM rss_copyright WHERE ID > ${id ?? 0} LIMIT 1000;`
    let rows = 1;
    while (rows > 0) {
        let id = rssCopyright.at(-1)?.id ?? 0;
        const sql = generateSql(id)
        let result = await db.selectAll(sql, [], null, 'rss')
        rows = result.rows
        rssCopyright.push(...result.data.map(r => {
            let pid = r.pid
            pid = rssSubscribe.get(pid)
            return {
                ...r,
                pid
            }
        }).filter(r => !!r.pid))
    }
    return rssCopyright
}

async function generateRssCopyrightSql(rssCopyright) {
    const array = Array.from(rssCopyright)
    let result = ''
    for (let i = 0; i < array.length; i += 10) {
        const arr = array.slice(i, i + 10);
        if (arr.length === 0) continue
        let insert = `INSERT INTO rss_copyright (pid,area,href,image) VALUES\n`
        let values = arr.map(r => `(${r.pid},'${r.area}','${r.href}','${r.image}')`)
            .join(',\n')
        result += insert + values + ';\n'
    }
    fs.writeFileSync('/home/maou/.github/node-server/resource/script_rebuild/rss_copyright.sql', result)
}