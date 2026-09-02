import { ApplicationContext } from "./context.js";
import * as k8s from '@kubernetes/client-node';
import yaml from 'yaml';
import { Worker } from 'worker_threads';
import { pushNotification } from "#api/sockets/notification.js";

const DEFAULT_CONFIG_MAP_NAME = 'node-server-extra-config';

/**
 * Kubernetes (K3S) 集群环境下的应用配置上下文管理器
 * 继承自 `ApplicationContext`，支持从 K8S ConfigMap 动态拉取远程配置，并由后台 Worker 线程持续监听变更事件以实现热刷新
 */
export class K8SApplicationContext extends ApplicationContext {
    /** @type {k8s.KubeConfig|null} K8S 集群认证配置对象 */
    #kubeConf = null;

    /** @type {k8s.CoreV1Api|null} K8S CoreV1Api API 客户端 */
    #k3sApi = null;

    /** @type {string|null} 目标监听的 ConfigMap 名称 */
    #configMap = null;

    /** @type {string[]} 需要提取并合并的 ConfigMap 内 key 标签列表 */
    #configLabels = [];

    /** @type {Worker|null} ConfigMap 变更监听后台工作线程 */
    #watcherWorker = null;

    /**
     * @param {string} resourcePath - 本地资源目录绝对路径
     * @param {string} [applicationType='yaml'] - 配置文件类型 ('yaml' | 'json')
     * @param {string[]} [configLabels=[]] - 需从 ConfigMap 提取解析的 Key 列表
     * @param {string} [configMap=DEFAULT_CONFIG_MAP_NAME] - K8S ConfigMap 名称
     */
    constructor(resourcePath, applicationType, configLabels = [], configMap = DEFAULT_CONFIG_MAP_NAME) {
        super(resourcePath, applicationType);
        this.#kubeConf = new k8s.KubeConfig();
        this.#kubeConf.loadFromCluster();
        this.#configLabels = configLabels;
        this.#configMap = configMap;
    }

    /**
     * 从 Kubernetes 集群读取指定命名空间下的 ConfigMap 配置并合并到上下文中，随后启动变更监听
     * @returns {Promise<void>}
     */
    async #loadConfiguration() {
        const placeholder = this.logPlaceholder();
        this.#k3sApi ??= this.#kubeConf.makeApiClient(k8s.CoreV1Api);
        const namespace = process.env.NAMESPACE || 'default';
        __log.info(`[${placeholder}] Use namespace: ${namespace}.`);
        const res = await this.#k3sApi.readNamespacedConfigMap({
            name: this.#configMap,
            namespace: namespace
        });
        this.#mergeConfiguration(res.data);
        this.#watchConfiguration();
    }

    /**
     * 将从 ConfigMap 中提取到的 YAML 数据逐项解析并合并到当前上下文中
     * @param {Record<string, string>} data - ConfigMap 的 data 键值字典
     */
    #mergeConfiguration(data) {
        for (const label of this.#configLabels) {
            const obj = yaml.parse(data[label]);
            this.mergeContext(obj, label);
        }
    }

    /**
     * 启动 Worker 后台线程，通过 K8S Watch API 监听 ConfigMap 实时变动
     */
    #watchConfiguration() {
        if (this.#watcherWorker !== null) return;
        const placeholder = this.logPlaceholder();
        this.#watcherWorker = new Worker(__join('@/src/jobs/watcher', 'k3sWatchWorker.js'), { workerData: { configMap: this.#configMap } });
        const this_ = this;
        this.#watcherWorker.on('message', async (message) => {
            if (message.event === 'CONFIG_UPDATED') {
                __log.info(`[${placeholder}] Configuration changed.`);
                await this_.#superLoad();
                this_.#mergeConfiguration(message.data);
                this_.refreshContext();
                pushNotification(`[K3S Configuration Watcher] Configuration changed.`);
            }
        });
    }

    /**
     * 执行父类基础配置文件加载
     * @returns {Promise<Record<string, any>>}
     */
    async #superLoad() {
        return super.load();
    }

    /**
     * 加载本地基础配置文件以及 K8S ConfigMap 配置
     * @returns {Promise<Record<string, any>>} 最终合并后的配置快照
     */
    async load() {
        await this.#superLoad();
        await this.#loadConfiguration();
        return this.getSnapshot();
    }

    /**
     * 获取日志输出的前缀占位符
     * @returns {string}
     */
    logPlaceholder() {
        return 'K8S Configuration';
    }

    /**
     * 判断某个 profile 是否被激活（包含本地 profile 及 ConfigMap labels）
     * @param {string} label - 待检测的 profile/label 名称
     * @returns {boolean} 是否处于激活状态
     */
    isActive(label) {
        return (__isNotBlank(label) && this.#configLabels.includes(label)) || super.isActive(label);
    }
}