import yaml from 'yaml';
import fs from 'fs';
import clashConst from '../constants/clashFileNameConst.js';
import { concatTailscale } from './clashTailscaleService.js';

/**
 * @typedef {import('@types/clashTypes.d.ts').ClashConfig} ClashConfig
 */

const latestClashFileName = clashConst.LATEST_FILE_NAME;
const deploymentFileName = clashConst.DEPLOYMENT_FILE_NAME;
const clashFileSuffixName = clashConst.CONFIG_SUFFIX;

/**
 * 更新并发布最新的 Clash 配置文件
 * 1. 自动备份旧版本至 backupPath，并根据上限自动轮转淘汰超期备份
 * 2. 移除配置黑名单字段 (excludeKeys) 并持久化写入 latest.yaml
 * 3. 混入 deployment 运行参数并写入生产配置 config.yaml
 * 4. 融合 Tailscale 节点与规则，生成 latest-tailscale.yaml
 * @param {ClashConfig} dataObj - 最新的 Clash 配置对象
 */
export function updateLatestConfig(dataObj) {
    const clashPathConfig = __env.get('clash.path', {});
    const savePath = clashPathConfig?.persistence ?? '@/';
    const backupPath = clashPathConfig?.backup ?? '@/';
    const deployPath = clashPathConfig?.deployment ?? '@/';
    const backupFileMaxNum = __env.get('clash.backup.fileLimit', 10);
    const excludeKeys = __env.get('clash.deployment.excludeKeys', []);
    const mixin = __env.get('clash.deployment.mixin', {});

    const saveFile = __join(savePath, latestClashFileName);
    // 1. 备份现有文件
    backupClashYaml(saveFile, savePath, backupPath, backupFileMaxNum);
    // 2. 移除指定排除项
    if (Array.isArray(excludeKeys)) {
        excludeKeys.forEach(k => Reflect.deleteProperty(dataObj, k));
    }
    const date = formattedDate();
    // 3. 持久化主配置
    savePersistenceYaml(dataObj, saveFile, date);
    // 4. 保存部署生产环境配置
    saveDeployClashYaml(dataObj, deployPath, mixin, date);

    // 5. 融合 Tailscale
    const tailscaleObj = concatTailscale(dataObj);
    const tailscaleFile = __join(savePath, clashConst.TAILSCALE_LATEST_FILE_NAME);
    savePersistenceYaml(tailscaleObj, tailscaleFile, date);
}

/**
 * 执行 Clash 历史版本文件物理备份与数量上限轮转清理
 * @param {string} saveFile - 源文件路径
 * @param {string} savePath - 保存目录
 * @param {string} backupPath - 备份目标目录
 * @param {number} backupFileMaxNum - 最大保留备份文件数
 */
function backupClashYaml(saveFile, savePath, backupPath, backupFileMaxNum) {
    if (!fs.existsSync(__join(savePath))) {
        fs.mkdirSync(__join(savePath), { recursive: true });
    }
    if (fs.existsSync(saveFile)) {
        const backupPath_ = __join(backupPath);
        if (!fs.existsSync(backupPath_)) {
            fs.mkdirSync(backupPath_, { recursive: true });
        }
        if (!!backupFileMaxNum && backupFileMaxNum > 0) {
            const backupFilesArr = fs.readdirSync(backupPath_)
                .filter(o => new RegExp(`.*${clashFileSuffixName}$`).test(o))
                .map(o => o.replace(clashFileSuffixName, ''));
            if (backupFilesArr.length >= backupFileMaxNum) {
                backupFilesArr.sort((a, b) => Number(a) - Number(b))
                    .slice(0, backupFilesArr.length - backupFileMaxNum + 1)
                    .map(o => o + clashFileSuffixName).forEach(f => {
                        try {
                            fs.unlinkSync(__join(backupPath_, f));
                            __log.info(`[Clash Backup] File delete: ${f} -> SUCCESS`);
                        } catch (error) {
                            __log.info(`[Clash Backup] File delete: ${f} -> FAIL`);
                        }
                    });
            }
        }
        const backup = __join(backupPath_, new Date().getTime() + clashFileSuffixName);
        fs.copyFileSync(saveFile, backup);
        __log.info(`[Clash Backup] File backup: ${backup}`);
    }
}

/**
 * 将配置对象序列化为 YAML 并写入目标持久化文件
 * @param {ClashConfig} obj - 配置对象
 * @param {string} saveFile - 目标文件路径
 * @param {string} date - 格式化的时间戳注释
 */
function savePersistenceYaml(obj, saveFile, date) {
    let objStr = generateUpdateTime(obj, date);
    if (__isBlank(objStr)) return;
    fs.writeFileSync(saveFile, objStr);
    __log.info(`[Clash Backup] File saved: ${saveFile}`);
}

/**
 * 混入运行期自定义属性并写入生产部署文件
 * @param {ClashConfig} obj - 基础配置对象
 * @param {string} deployPath - 部署目录
 * @param {Record<string, any>} mixin - 混入属性
 * @param {string} date - 时间戳字符串
 */
function saveDeployClashYaml(obj, deployPath, mixin, date) {
    const deploymentFile = __join(deployPath, deploymentFileName);
    if (mixin && typeof mixin === 'object') {
        Object.assign(obj, mixin);
    }
    let objStr = generateUpdateTime(obj, date);
    if (__isBlank(objStr)) return;
    fs.writeFileSync(deploymentFile, objStr);
    __log.info(`[Clash Deploy] File saved: ${deploymentFile}`);
}

/**
 * 生成带有更新时间注释前缀的 YAML 文本
 * @param {ClashConfig} clashYaml - 配置对象
 * @param {string} date - 格式化时间
 * @returns {string}
 */
function generateUpdateTime(clashYaml, date) {
    let str = yaml.stringify(clashYaml);
    const n = `\r\n`;
    const c = `# Update Datetime: ${date} #`;
    const p = new Array(c.length).fill('#', 0, c.length).join('');
    return [p, c, p, str].join(n);
}

/**
 * 获取当前时间格式化字符串 (yyyy/MM/dd HH:mm:ss.sss)
 * @returns {string}
 */
function formattedDate() {
    const date = new Date();
    const yyyy = date.getFullYear();
    const MM = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const HH = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    const sss = String(date.getMilliseconds()).padStart(3, '0');
    return `${yyyy}/${MM}/${dd} ${HH}:${mm}:${ss}.${sss}`;
}