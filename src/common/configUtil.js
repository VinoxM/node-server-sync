import fs from 'fs';

const defaultSecret = "mAou5820";

export function getDefaultSecret() {
    return __env.get('api.defaultSecret', defaultSecret)
}

function getFolderScripts(folder, recursive = false) {
    const folderStack = [folder];
    const resultFiles = [];
    while (folderStack.length > 0) {
        const folder_ = folderStack.pop()
        fs.readdirSync(__join(folder_)).forEach(f => {
            const fileName = __join(folder_, f);
            if (fs.lstatSync(fileName).isDirectory()) {
                if (recursive) folderStack.push(fileName);
            } else if (f.endsWith(".js") && f !== 'index.js') {
                resultFiles.push({name: f.replaceAll(/.js$/g, ''), path: fileName});
            }
        })
    }
    return resultFiles;
}

async function importScript(file) {
    return fs.existsSync(file) && fs.lstatSync(file).isFile() ? import(file) : Promise.resolve(null)
}

export async function importFolderScripts(folder, recursive, callback) {
    return callback && typeof callback === 'function' ?
        getFolderScripts(folder, recursive).reduce((prev, cur) => prev.then(() => importScript(cur.path).then(module => {
            if (module !== null && module !== undefined) {
                callback(module, cur.name)
            }
        })), Promise.resolve()) :
        Promise.resolve()
}