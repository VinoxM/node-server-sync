import fs from 'fs';

/**
 * 遍历指定目录并获取所有 JavaScript 脚本文件路径与模块名
 * @param {string} folder - 目录路径（支持 `@` 根路径简写）
 * @param {boolean} [recursive=false] - 是否递归遍历子目录
 * @returns {Array<{ name: string, path: string }>} 脚本文件信息列表
 */
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

/**
 * 动态导入指定路径的 JS 模块文件
 * @param {string} file - 文件绝对路径
 * @returns {Promise<any|null>} 导入的模块对象，若文件不存在则返回 null
 */
async function importScript(file) {
    return fs.existsSync(file) && fs.lstatSync(file).isFile() ? import(file) : Promise.resolve(null)
}

/**
 * 批量动态导入指定文件夹下的所有 JS 脚本文件，并按顺序执行回调
 * @param {string} folder - 目标文件夹路径（支持 `@` 根路径前缀）
 * @param {boolean} [recursive=false] - 是否递归导入子目录下的脚本
 * @param {(module: any, name: string) => void|Promise<void>} callback - 每个脚本导入完成后的处理回调
 * @returns {Promise<void>} 所有脚本加载完成的 Promise
 */
export async function importFolderScripts(folder, recursive, callback) {
    return callback && typeof callback === 'function' ?
        getFolderScripts(folder, recursive).reduce((prev, cur) => prev.then(() => importScript(cur.path).then(module => {
            if (module !== null && module !== undefined) {
                callback(module, cur.name)
            }
        })), Promise.resolve()).catch(e => console.error(e)) :
        Promise.resolve()
}