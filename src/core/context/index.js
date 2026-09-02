import { ApplicationContext } from "./context.js";
import { K8SApplicationContext } from "./k8sContext.js";

/**
 * 创建应用配置上下文实例工厂函数
 * 根据环境变量 `APP_ENV` 判断是在 K8S/K3S Pod 容器中运行还是本地单机运行，自动返回对应的上下文实现
 * @param {string} rootPath - 配置文件所在根目录绝对路径
 * @param {string} [applicationType='yaml'] - 配置文件类型 ('yaml' | 'json')
 * @returns {ApplicationContext|K8SApplicationContext} 应用程序配置上下文实例
 */
export function createContext(rootPath, applicationType) {
    const appEnv = process.env.APP_ENV;
    const configMap = process.env.CONFIG_MAP;
    const configLabels = (process.env.CONTEXT_LABELS || '').split(',');
    if (appEnv === 'k3s-pod') {
        return new K8SApplicationContext(rootPath, applicationType, configLabels, configMap);
    } else {
        return new ApplicationContext(rootPath, applicationType);
    }
}