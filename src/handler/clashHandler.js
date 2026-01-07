import fs from 'fs';
import iconv from 'iconv-lite';
import yaml from 'yaml';
import { getUrlFull } from '../common/httpUtil.js';
import { pushNotification } from '../sockets/notification.js';

const subInfoFileName = 'subInfo.txt';
const clashFileName = 'config.yaml';

const getClashConfig = () => __env.get('clash', {})

export const updateClashSubInfo = (from = 'Unknown') => {
    return new Promise((resolve, reject) => {
        const clashConfig = getClashConfig();
        logger('[Clash Subscribe] Update Clash Subscribe Info.');
        if (isBlank(clashConfig.updateUrl)) {
            logger('[Clash Subscribe] Failed. Cause: Update Url is empty.');
            reject({ msg: 'Update Url is empty.' });
        } else if (isBlank(clashConfig.savePath)) {
            reject({ msg: 'Clash savePath is empty.' });
        } else {
            const { savePath, updateUrl } = clashConfig;
            const subInfoFile = join(savePath, subInfoFileName);
            getUrlFull(updateUrl).then(res => {
                if (!fs.existsSync(join(savePath))) {
                    fs.mkdirSync(join(savePath), { recursive: true })
                }
                let info = res.headers['subscription-userinfo']
                fs.writeFileSync(subInfoFile, info)
                logger('[Clash Subscribe] Success.');
                info = info.split('; ')
                const message = { event: 'Clash Subscribe' }
                info.forEach(str => {
                    const kv = str.split('=')
                    message[kv[0]] = kv[1]
                })
                pushNotification(JSON.stringify(message), from)
                resolve();
            }).catch(reject);
        }
    })
}

export const getClashFileContent = () => {
    return new Promise((resolve, reject) => {
        const { savePath } = getClashConfig();
        const filePath = join(savePath, clashFileName);
        if (fs.existsSync(filePath)) {
            const subInfoFile = join(savePath, subInfoFileName);
            const result = {
                headers: {},
                content: null
            }
            if (fs.existsSync(subInfoFile)) {
                result.headers['subscription-userinfo'] = fs.readFileSync(subInfoFile).toString();
            }
            fs.readFile(filePath, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    const buf = Buffer.from(data);
                    result.content = iconv.decode(buf, 'utf8');
                    resolve(result);
                }
            })
        } else {
            reject({ msg: 'Clash config file not found.' })
        }
    })
}

export const backupConfigYaml = (data) => {
    let dataObj = null
    try {
        dataObj = yaml.parse(data)
    } catch (ex) {
        error(`[Clash Backup] parse yaml failed.`, ex)
        throwMessage('Invalid file data.')
    }
    const { savePath, backupPath, backupFileMaxNum, deployPath, excludeKeys, mixin } = getClashConfig();
    const saveFile = join(savePath, clashFileName);
    // 备份文件
    backupClashYaml(saveFile, savePath, backupPath, backupFileMaxNum)
    // 取出更新时间
    const updateTime = generateClashUpdateTime(dataObj)
    // 处理要排除的 keys
    if (Array.isArray(excludeKeys)) {
        excludeKeys.forEach(k => Reflect.deleteProperty(dataObj, k))
    }
    // 拼接更新时间
    let excludeStr = yaml.stringify(dataObj)
    if (isNotBlank(updateTime)) {
        excludeStr = [updateTime, excludeStr].join('\r\n')
    }
    // 保存文件
    fs.writeFileSync(saveFile, excludeStr)
    logger(`[Clash Backup] File saved: ${saveFile}`);
    // 保存部署用文件
    saveDeployClashYaml(dataObj, deployPath, mixin);
}

function backupClashYaml(saveFile, savePath, backupPath, backupFileMaxNum) {
    if (!fs.existsSync(join(savePath))) {
        fs.mkdirSync(join(savePath), { recursive: true })
    }
    if (fs.existsSync(saveFile)) {
        const backupPath_ = join(backupPath)
        if (!fs.existsSync(backupPath_)) {
            fs.mkdirSync(backupPath_, { recursive: true })
        }
        if (!!backupFileMaxNum && backupFileMaxNum > 0) {
            const backupFilesArr = fs.readdirSync(backupPath_).filter(o => /.*\.yml$/.test(o)).map(o => o.replace('.yml', ''))
            if (backupFilesArr.length >= backupFileMaxNum) {
                backupFilesArr.sort((a, b) => Number(a) - Number(b)).slice(0, backupFilesArr.length - backupFileMaxNum + 1).map(o => o + '.yml').forEach(f => {
                    try {
                        fs.unlinkSync(join(backupPath_, f))
                        logger(`[Clash Backup] File delete: ${f} -> SUCCESS`)
                    } catch (error) {
                        logger(`[Clash Backup] File delete: ${f} -> FAIL`)
                    }
                })
            }
        }
        const backup = join(backupPath_, new Date().getTime() + '.yml')
        fs.copyFileSync(saveFile, backup);
        logger(`[Clash Backup] File backup: ${backup}`);
    }
}

function generateClashUpdateTime(obj) {
    const updateDate = obj.update
    if (isBlank(updateDate)) {
        return ''
    }
    const n = `\r\n`
    const c = `# Update Datetime: ${updateDate} #`
    const p = new Array(c.length).fill('#', 0, c.length).join('')
    return [p, c, p].join(n)
}

function saveDeployClashYaml(obj, deployPath, mixin) {
    const saveFile = join(deployPath, clashFileName)
    if (mixin && typeof mixin === 'object') {
        Object.assign(obj, mixin)
    }
    let objStr = yaml.stringify(obj)
    if (isBlank(objStr)) return
    fs.writeFileSync(saveFile, objStr)
    logger(`[Clash Deploy] File saved: ${saveFile}`);
}
