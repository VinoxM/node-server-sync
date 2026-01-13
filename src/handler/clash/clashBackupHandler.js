import yaml from 'yaml';
import fs from 'fs';
import clashConst from '../../constraints/clashFileNameConst.js';

const latestClashFileName = clashConst.LATEST_FILE_NAME
const deploymentFileName = clashConst.DEPLOYMENT_FILE_NAME
const clashFileSuffixName = clashConst.CONFIG_SUFFIX

export function updateLatestConfig(dataObj) {
    const clashPathConfig = __env.get('clash.path', {})
    const savePath = clashPathConfig?.persistence ?? '@/'
    const backupPath = clashPathConfig?.backup ?? '@/'
    const deployPath = clashPathConfig?.deployment ?? '@/'
    const backupFileMaxNum = __env.get('clash.backup.fileLimit', 10)
    const excludeKeys = __env.get('clash.deployment.excludeKeys', {})
    const mixin = __env.get('clash.deployment.mixin', {})

    const saveFile = __join(savePath, latestClashFileName);
    // 备份文件
    backupClashYaml(saveFile, savePath, backupPath, backupFileMaxNum)
    // 处理要排除的 keys
    if (Array.isArray(excludeKeys)) {
        excludeKeys.forEach(k => Reflect.deleteProperty(dataObj, k))
    }
    const date = formattedDate()
    // 保存文件
    savePersistenceYaml(dataObj, saveFile, date)
    // 保存部署用文件
    saveDeployClashYaml(dataObj, deployPath, mixin, date);
}

function backupClashYaml(saveFile, savePath, backupPath, backupFileMaxNum) {
    if (!fs.existsSync(__join(savePath))) {
        fs.mkdirSync(__join(savePath), { recursive: true })
    }
    if (fs.existsSync(saveFile)) {
        const backupPath_ = __join(backupPath)
        if (!fs.existsSync(backupPath_)) {
            fs.mkdirSync(backupPath_, { recursive: true })
        }
        if (!!backupFileMaxNum && backupFileMaxNum > 0) {
            // /.*\.yaml$/
            const backupFilesArr = fs.readdirSync(backupPath_)
                .filter(o => new RegExp(`.*${clashFileSuffixName}$`).test(o))
                .map(o => o.replace(clashFileSuffixName, ''))
            if (backupFilesArr.length >= backupFileMaxNum) {
                backupFilesArr.sort((a, b) => Number(a) - Number(b))
                    .slice(0, backupFilesArr.length - backupFileMaxNum + 1)
                    .map(o => o + clashFileSuffixName).forEach(f => {
                        try {
                            fs.unlinkSync(__join(backupPath_, f))
                            __log.info(`[Clash Backup] File delete: ${f} -> SUCCESS`)
                        } catch (error) {
                            __log.info(`[Clash Backup] File delete: ${f} -> FAIL`)
                        }
                    })
            }
        }
        const backup = __join(backupPath_, new Date().getTime() + clashFileSuffixName)
        fs.copyFileSync(saveFile, backup);
        __log.info(`[Clash Backup] File backup: ${backup}`);
    }
}

function savePersistenceYaml(obj, saveFile, date) {
    let objStr = generateUpdatetime(obj, date)
    if (isBlank(objStr)) return
    fs.writeFileSync(saveFile, objStr)
    __log.info(`[Clash Backup] File saved: ${saveFile}`);
}

function saveDeployClashYaml(obj, deployPath, mixin, date) {
    const deploymentFile = __join(deployPath, deploymentFileName)
    if (mixin && typeof mixin === 'object') {
        Object.assign(obj, mixin)
    }
    let objStr = generateUpdatetime(obj, date)
    if (isBlank(objStr)) return
    fs.writeFileSync(deploymentFile, objStr)
    __log.info(`[Clash Deploy] File saved: ${deploymentFile}`);
}

function generateUpdatetime(clashYaml, date) {
    let str = yaml.stringify(clashYaml)
    const n = `\r\n`
    const c = `# Update Datetime: ${date} #`
    const p = new Array(c.length).fill('#', 0, c.length).join('')
    return [p, c, p, str].join(n)
}

function formattedDate() {
    const date = new Date();
    const yyyy = date.getFullYear()
    const MM = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const HH = String(date.getHours()).padStart(2, '0')
    const mm = String(date.getMinutes()).padStart(2, '0')
    const ss = String(date.getSeconds()).padStart(2, '0')
    const sss = String(date.getMilliseconds()).padStart(3, '0')
    return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}.${sss}`
}