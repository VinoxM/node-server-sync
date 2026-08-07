import { ApplicationContext } from "./context.js";
import * as k8s from '@kubernetes/client-node';
import yaml from 'yaml';
import { Worker } from 'worker_threads';
import { pushNotification } from "../../api/sockets/notification.js";

const DEFAULT_CONFIG_MAP_NAME = 'node-server-extra-config'

export class K8SApplicationContext extends ApplicationContext {

    #kubeConf = null;
    #k3sApi = null;

    #configMap = null;
    #configLabels = [];

    #watcherWorker = null;

    constructor(resourcePath, applicationType, configLabels = [], configMap = DEFAULT_CONFIG_MAP_NAME) {
        super(resourcePath, applicationType)
        this.#kubeConf = new k8s.KubeConfig()
        this.#kubeConf.loadFromCluster()
        this.#configLabels = configLabels
        this.#configMap = configMap
    }

    async #loadConfiguration() {
        const placeholder = this.logPlaceholder()
        this.#k3sApi ??= this.#kubeConf.makeApiClient(k8s.CoreV1Api);
        const namespace = process.env.NAMESPACE || 'default';
        __log.info(`[${placeholder}] Use namespace: ${namespace}.`)
        const res = await this.#k3sApi.readNamespacedConfigMap({
            name: this.#configMap,
            namespace: namespace
        })
        this.#mergeConfiguration(res.data)
        this.#watchConfiguration()
    }

    #mergeConfiguration(data) {
        for (const label of this.#configLabels) {
            const obj = yaml.parse(data[label])
            this.mergeContext(obj, label)
        }
    }

    #watchConfiguration() {
        if (this.#watcherWorker !== null) return;
        const placeholder = this.logPlaceholder();
        this.#watcherWorker = new Worker(__join('@/src/jobs/watcher', 'k3sWatchWorker.js'), { workerData: { configMap: this.#configMap } });
        const this_ = this
        this.#watcherWorker.on('message', async (message) => {
            if (message.event === 'CONFIG_UPDATED') {
                __log.info(`[${placeholder}] Configuration changed.`);
                await this_.#superLoad()
                this_.#mergeConfiguration(message.data)
                this_.refreshContext()
                pushNotification(`[K3S Configuration Watcher] Configuration changed.`)
            }
        });
    }

    async #superLoad() {
        return super.load()
    }

    async load() {
        await this.#superLoad()
        await this.#loadConfiguration()
        return this.getSnapshot()
    }

    logPlaceholder() {
        return 'K8S Configuration'
    }

    isActive(label) {
        return (__isNotBlank(label) && this.#configLabels.includes(label)) || super.isActive(label)
    }
}