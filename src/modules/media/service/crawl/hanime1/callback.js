export function getCanAdd() {
    const map = new Map();
    const checkRules = items => {
        if (items.length === 0) return;
        for (const elem of items) {
            const fileRenameRegex = /[\\/:"*<>?\\\\|]|(\\uD83D\\uDC95)|(❤\\uFE0F)/g;
            const nextElem = elem.nextElementSibling;
            let author = '';
            if (nextElem && nextElem.classList.contains('subtitle')) {
                author = nextElem.querySelector('a')?.textContent || '';
            }
            author = author.split('•')[0].trim();
            author = author.replaceAll(fileRenameRegex, '');
            const href = elem.querySelector('a.video-link')?.href ?? elem.href ?? '';
            const uniqueId = /.*\\?v=([0-9]+)?/.exec(href)?.[1] || '';
            const res = { author, uniqueId };
            map.set(uniqueId, res);
        }
    }
    const normalItems = Array.from(document.querySelectorAll('.video-item-container a[href*=".me/watch?v="]'));
    checkRules(normalItems);
    const insideItems = Array.from(document.querySelectorAll(".home-rows-videos-wrapper a[href*='.me/watch?v='], #related-tabcontent a[href*='.me/watch?v=']"));
    checkRules(insideItems);
    return Array.from(map.values());
}

export function getInfo(skipInside = false, skipDance = false, current = false) {
    const result = { urlList: [], author: null, playlist: null };
    let urls = [];
    // 判断里
    const artist = document.querySelector("#video-artist-name");
    const animeType = String(artist?.attributes.getNamedItem("href")?.value) || '';
    const isInside = ['裏番', '泡麵番'].some(o => animeType.endsWith(o));
    if (isInside && skipInside) return result;
    // 获取作者
    const fileRenameRegex = /[\\/:"*<>?\\\\|]|(\\uD83D\\uDC95)|(❤\\uFE0F)/g;
    let author = ("" + artist?.textContent || 'unknown').replaceAll(/\\/g, '').replace(fileRenameRegex, '').trim()
    let authorTrim = author.replace(/\\(.*?\\)/, "").trim()
    let authorDeform = author.replace(/_/g, " ").trim()
    const replaceStr = (title, authorStr) => {
        let str = String(title)
        let findStr = '[' + authorStr.toLowerCase() + ']'
        const index = str.toLowerCase().indexOf(findStr)
        if (index === 0) return str.substring(findStr.length).trim()
        return title
    }
    const titleHandler = [
        title => title.replaceAll(fileRenameRegex, ''),
        title => replaceStr(title, author),
        title => replaceStr(title, authorTrim),
        title => replaceStr(title, authorDeform),
        title => title.replace('[中文字幕]', ''),
        title => title.trim()
    ]
    const urlMatches = [
        ({ href }) => !urls.some(({ href: h }) => h === href),
        ({ title }) => title.indexOf("新番預告") === -1,  // 去除新番预告
        ({ title }) => skipDance ? ("" + title).toLowerCase().indexOf("dance") === -1 : true // 去除跳舞
    ]
    Array.from(document.querySelectorAll(current ? "#playlist-scroll>div.videos-scroll" : "#playlist-scroll>div")).reverse().forEach(div => {
        // 取出播放列表各项的链接、标题
        const href = div.querySelector("div.thumb-container>a")?.attributes.getNamedItem("href").value || ''
        const id = /.*\\?v=([0-9]+)?/.exec(href)?.[1] || ''
        const title = titleHandler.reduce((t, fn) => fn(t), div.querySelector("h4.video-title>a")?.textContent || '')
        if (href && urlMatches.every(f => f({ href, title }))) {
            urls.push({ href, title, id })
        }
    })
    if (urls.length > 0 && isInside) {
        // 如果是里,去除候补项
        urls = urls.filter(o => !o.title.startsWith('[中字後補]') && !o.title.startsWith('[中文後補]'))
        // 修改保存文件名为里名
        result.playlist = (document.querySelector("#playlist-top-block h4 a")?.textContent.replace(fileRenameRegex, '') || urls[0].title.replace(/[0-9]*$/, '')).trim()
    }
    result.urlList = urls;
    result.author = author;
    return result
}

export async function getDownload() {
    let result = null
    const elem = document.querySelector('.exoclick-popunder')
    if (elem) {
        const img = document.querySelector("img.download-image")
        result = {
            title: elem.download ?? '',
            href: elem.href || elem.getAttribute("data-url") || '',
            cover: img.src ?? ''
        }
    }
    return result
}

export async function getTags() {
    return Array.from(document.querySelectorAll(".video-details-wrapper>div.single-video-tag>a[href^='/search']")).map(item => (Array.from(item.childNodes).find(n => n.nodeType === 3)?.nodeValue || item.innerText).trim());
}