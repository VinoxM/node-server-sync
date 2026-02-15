import fs from 'fs';
import path from 'path';

let source = "/media/maou/Database/Downloads/Anime";

let saved = "/media/maou/Database/Downloads/Anime";

export function doAnimeGroup() {
    const files = fs.readdirSync(source);
    if (files.length === 0) return
    const anime = []
    files.forEach(f => {
        if (!isFile(f)) return;
        if (isVideo(f)) {
            anime.push(f)
        } else if (isTorrent(f)) {
            try {
                fs.unlinkSync(path.join(source, f))
                console.log(`[成功] 删除: ${f}`)
            } catch (e) {
                console.error(`[错误] 删除: ${f}`)
            }
        }

    })
    if (anime.length === 0) {
        console.log('未发现匹配的文件')
        return
    }
    const newFolders = {}
    anime.forEach(f => {
        const name = getAnimeName(f)
        if (newFolders.hasOwnProperty(name)) {
            newFolders[name].push(f)
        } else newFolders[name] = [f]
    })
    for (const key in newFolders) {
        const fPath = path.join(saved, key)
        if (!fs.existsSync(fPath)) {
            fs.mkdirSync(fPath)
        }
        for (const f of newFolders[key]) {
            try {
                fs.renameSync(path.join(source, f), path.join(fPath, f))
                console.log(`[成功] 分组: ${key} -> ${f}`)
            } catch (e) {
                console.log(e);
                console.error(`[错误] 分组: ${key} -> ${f}`)
            }
        }
    }
}

function isFile(file) {
    const p = path.join(source, file)
    const stat = fs.lstatSync(p)
    return stat.isFile();
}

function isVideo(file) {
    const regex = /(\.(swf|avi|flv|mpg|rm|mov|wav|asf|3gp|mkv|rmvb|mp4))$/i
    const p = path.join(source, file)
    return regex.test(p)
}

function isTorrent(file) {
    const regex = /\.torrent$/i
    const p = path.join(source, file)
    return regex.test(p)
}

function getAnimeName(file) {
    let name = ''
    const regex = [
        /\s-\s\d\d/,
        /\[\d\d]/,
        /\[SP\d\d]/i,
        /\[\d\dv2]/i,
        /\[\d\dend]/i,
        /\[\d\d-\d\d]/,
        /\s-\sS\d\d/,
        /\s\d\d\s\[/i
    ]
    let array = null;
    if (regex.some(reg => {
        array = file.match(reg)
        return array !== null
    })) {
        // 截取字幕组名 + 番剧名
        name = file.substring(0, array.index)
        /**
         * 仅有番剧名
         * 例: [Tensei Shitara Slime Datta Ken]
         * -> Tensei Shitara Slime Datta Ken
         */
        if (/^\[(?!.*\[|]).*]$/.test(name)) {
            name = name.substring(1, name.length - 1)
        } else {
            /**
             * 去除番剧名外中括号
             * 例: [KTXP][Hokkaido_Gals_Are_Super_Adorable!]
             * -> [KTXP] Hokkaido_Gals_Are_Super_Adorable!
             */
            const r = name.match(/^\[.*?]\[(.*?)]/)
            if (r && r[1]) {
                name = name.replace(`[${r[1]}]`, ` ${r[1]}`)
            }
        }
    } else {
        name = file.replace(/(\.(swf|avi|flv|mpg|rm|mov|wav|asf|3gp|mkv|rmvb|mp4))$/i, "")
    }
    name = name.trimEnd()
    /*} else {
        const repReg = [
            /\[1080p]/i,
            /\[baha]/i,
            /\[bilibili]/i,
            /\[web-dl]/i,
            /\[cht]/i,
            /\[chs]/i,
        ]
    }*/
    return name
}