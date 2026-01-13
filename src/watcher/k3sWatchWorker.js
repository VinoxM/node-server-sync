import { workerData, parentPort } from 'worker_threads';
import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
kc.loadFromCluster();
const watch = new k8s.Watch(kc);

const options = workerData

function startWatch() {
    const { configMap } = options
    watch.watch(
        '/api/v1/namespaces/nodejs/configmaps',
        { fieldSelector: `metadata.name=${configMap}` },
        (type, apiObj) => {
            if (type === 'MODIFIED') {
                parentPort.postMessage({ event: 'CONFIG_UPDATED', data: apiObj.data });
            }
        },
        (err) => {
            if (err) {
                console.error('Watch configMap error.', err?.message || err)
                setTimeout(startWatch, 5000);
            } else {
                startWatch();
            }
        }
    );
}

startWatch();