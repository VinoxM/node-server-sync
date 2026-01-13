import { ApplicationContext } from "./context.js"
import { K8SApplicationContext } from "./k8sContext.js"

export function createContext(rootPath, applicationType) {
    const appEnv = process.env.APP_ENV
    const configMap = process.env.CONFIG_MAP
    const configLabels = (process.env.CONTEXT_LABELS || '').split(',')
    if (appEnv === 'k3s-pod') {
        return new K8SApplicationContext(rootPath, applicationType, configLabels, configMap)
    } else {
        return new ApplicationContext(rootPath, applicationType)
    }
}