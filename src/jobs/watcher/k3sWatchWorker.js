import { workerData, parentPort } from 'worker_threads';
import * as k8s from '@kubernetes/client-node';

/**
 * Kubernetes K3s ConfigMap 变更事件监听后台 Worker 工作线程
 * 通过 `@kubernetes/client-node` 的 Watch API 实时监听指定命名空间下的 ConfigMap 修改事件，
 * 当检测到配置发生变动 (MODIFIED) 时向主线程派发 `CONFIG_UPDATED` 消息以驱动应用配置热刷新。
 */

/** @type {k8s.KubeConfig} Kubernetes 集群配置实例 (基于 Pod 内 ServiceAccount 自动加载) */
const kc = new k8s.KubeConfig();
kc.loadFromCluster();

/** @type {k8s.Watch} K8S Watch API 客户端 */
const watch = new k8s.Watch(kc);

/** @type {{ configMap: string }} 从主线程传入的 Worker 数据选项 */
const options = workerData;

/**
 * 启动 ConfigMap 变更长连接监听并维护断线重连
 */
function startWatch() {
    const { configMap } = options;
    watch.watch(
        '/api/v1/namespaces/nodejs/configmaps',
        { fieldSelector: `metadata.name=${configMap}` },
        /**
         * 接收到 K8S 资源变更事件回调
         * @param {string} type - 事件类型 ('ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR')
         * @param {k8s.V1ConfigMap} apiObj - ConfigMap 资源对象
         */
        (type, apiObj) => {
            if (type === 'MODIFIED') {
                parentPort?.postMessage({ event: 'CONFIG_UPDATED', data: apiObj.data });
            }
        },
        /**
         * 监听流关闭或异常断开回调
         * @param {any} err - 错误对象
         */
        (err) => {
            if (err) {
                console.error('[K3s Watcher Worker] Watch configMap error:', err?.message || err);
                setTimeout(startWatch, 5000);
            } else {
                startWatch();
            }
        }
    );
}

// 启动监听流程
startWatch();