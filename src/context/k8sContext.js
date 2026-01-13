import { ApplicationContext } from "./context.js"
import * as k8s from '@kubernetes/client-node'
import yaml from 'yaml'
import k3sConst from "../constraints/k3sConst.js"
import { pushNotification } from '../sockets/notification.js'
import { Worker } from 'worker_threads'

export class K8SApplicationContext extends ApplicationContext {

    #kubeConf = null;
    #k3sApi = null;

    #configMap = null;
    #configLabels = []

    constructor(resourcePath, applicationType, configLabels = [], configMap = k3sConst.DEFAULT_CONFIG_MAP_NAME) {
        super(resourcePath, applicationType)
        this.#kubeConf = new k8s.KubeConfig()
        this.#kubeConf.loadFromCluster()
        this.#configLabels = configLabels
        this.#configMap = configMap
    }

    async #loadConfiguration() {
        const placeholder = this.logPlaceholder()
        this.#k3sApi = this.#kubeConf.makeApiClient(k8s.CoreV1Api);
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
        const placeholder = this.logPlaceholder()
        const this_ = this
        const watcherWorker = new Worker(__join('@/src/watcher', 'k3sWatchWorker.js'), { workerData: { configMap: this.#configMap } });
        watcherWorker.on('message', (message) => {
            if (message.event === 'CONFIG_UPDATED') {
                __log.info(`[${placeholder}] Configuration changed.`);
                this_.#superLoad()
                this_.#mergeConfiguration(message.data)
                this_.refreshContext()
                pushNotification(JSON.stringify({
                    event: 'log',
                    message: `[K3S Configuration Watcher] Configuration changed.`
                }))
            }
        });
    }

    #superLoad() {
        return super.load()
    }

    async load() {
        const context = this.#superLoad()
        return this.#loadConfiguration().then(() => context)
    }

    logPlaceholder() {
        return 'K8S Configuration'
    }
}