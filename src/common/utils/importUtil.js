import fs from 'fs';

function getFolderScripts(folder, recursive = false) {
    const folderStack = [folder];
    const resultFiles = [];
    while (folderStack.length > 0) {
        const folder_ = __join(folderStack.pop())
        const dirFiles = fs.existsSync(folder_) ? fs.readdirSync(folder_) : []
        dirFiles.forEach(f => {
            const fileName = __join(folder_, f);
            if (fs.lstatSync(fileName).isDirectory()) {
                if (recursive) folderStack.push(fileName);
            } else if (f.endsWith(".js") && f !== 'index.js') {
                resultFiles.push({ name: f.replaceAll(/.js$/g, ''), path: fileName });
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
        })), Promise.resolve()).catch(e => console.error(e)) :
        Promise.resolve()
}