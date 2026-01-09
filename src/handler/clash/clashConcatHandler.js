import yaml from 'yaml'
import fs from 'fs'
import path from 'path';
import clashConst from '../../constraints/clashFileNameConst.js';
import { updateLatestConfig } from './clashBackupHandler.js';
import { getSubscriptionSourcesObj } from './clashSubscribeHandler.js';

export function concatClashYaml() {
    const concatPath = __join(__env.get('clash.path.concat', '@/'))
    if (!fs.existsSync(concatPath)) {
        throwMessage('Clash concatPath not exists.')
    }
    const sources = getSubscriptionSourcesObj()
    if (sources.length === 0) {
        throwMessage('Clash sources is empty.')
    }
    const content = yaml.parse(fs.readFileSync(path.join(concatPath, clashConst.CONCAT_BASIC_FILE_NAME)).toString())
    const clashYaml = mixinModule(content, concatPath, sources)
    updateLatestConfig(clashYaml)
}

function mixinModule(content, concatPath, sources = []) {
    let proxies = []

    const sourceProxies = sources.length <= 1 ?
        sources.map(o => o?.obj?.proxies ?? []) :
        sources.reduce((prev, cur) => {
            const { label, obj } = cur
            return [...prev, ...(obj?.proxies ?? []).map(p => (p.name = `${label} - ${p.name}`, p))]
        }, [])

    proxies = [...proxies, ...sourceProxies]

    // reduce proxies
    const proxyFilters = __env.get('clash.concat.proxyFilters', [])
    proxies = proxies.filter(p => {
        return !proxyFilters.some(str => String(p.name).indexOf(str) > -1)
    })
    content.proxies = proxies

    // proxies keyword group
    const groupMapping = __env.get('clash.concat.groupMapping', [])
    const proxiesConcatKeyword = {
        "ALL": proxies
    }
    Object.keys(groupMapping).forEach(key => {
        proxiesConcatKeyword[key] = proxies.filter(p => {
            return groupMapping[key].some(str => String(p.name).indexOf(str) > -1)
        })
    })

    const proxyGroupFilters = __env.get('clash.concat.proxyGroupFilters', [])

    content['proxy-groups'] = content['proxy-groups'].filter(g => !proxyGroupFilters.includes(g.name))

    // keyword replace
    const fallbackUrl = __env.get('clash.concat.fallbackUrl', 'http://www.gstatic.com/generate_204')
    content['proxy-groups'].forEach(g => {
        if (g.type === 'fallback') {
            g.url = fallbackUrl
            g.interval = 3000
            g.proxies = g.proxies.slice(0, 1)
            return g
        }
        const proxiesConcat = new Map()
        g.proxies.forEach((p, i) => {
            if (String(p).startsWith('concat')) {
                proxiesConcat.set(i, proxiesConcatKeyword[String(p).replace('concat-', '').toLocaleUpperCase()] ?? [])
            }
        })
        let lastIndex = 0
        const result = proxiesConcat.keys().reduce((arr, index) => {
            arr = [...arr, ...g.proxies.slice(lastIndex, index)]
            arr = [...arr, ...proxiesConcat.get(index).map(o => o.name)]
            lastIndex = index + 1
            return arr
        }, [])
        if (proxiesConcat.size > 0) {
            g.proxies = result
        }
        if (g.proxies.length === 0) {
            g.proxies = ['DIRECT']
        }
    })

    handleMixinYaml(content, concatPath);

    handlePrefixYaml(content, concatPath);

    handleRuleProviders(content, concatPath);

    delete content.enable;

    let duplicates = new Map()
    for (const r of content.rules) {
        const newVar = r?.split(',') || []
        if (newVar.length === 3 && !proxyGroupFilters.includes(newVar[2])) {
            const k = newVar[0] + newVar[1]
            !duplicates.has(k) && duplicates.set(k, r)
        }
        if (newVar.length === 2 && newVar[0] === 'MATCH') {
            const k = newVar[0] + newVar[1]
            duplicates.set(k, r)
        }
    }

    content.rules = [...duplicates.values()]

    return content;
}

function handleMixinYaml(content, concatPath) {
    const CONFIG_MIXIN = path.join(concatPath, clashConst.CONCAT_MIXIN_FILE_NAME)
    const config = yaml.parse(fs.readFileSync(CONFIG_MIXIN).toString())

    // proxy-groups replace
    const proxyGroups = config['proxy-groups'] || []
    proxyGroups.forEach(proxy => {
        let index = -1
        content['proxy-groups'].some((p, i) => {
            if (p.name !== proxy.name) return false
            index = i
            return true
        })
        if (index > -1) {
            content['proxy-groups'].splice(index, 1, proxy)
        } else {
            content['proxy-groups'].push(proxy)
        }
    })

    // local minix
    let rules = config.rules || []
    content.rules = [...content.rules, ...rules]
}

function handlePrefixYaml(content, concatPath) {
    const CONFIG_PREFIX = path.join(concatPath, clashConst.CONCAT_PREFIX_FILE_NAME)
    const config = yaml.parse(fs.readFileSync(CONFIG_PREFIX).toString())

    let rules = config.rules || []
    content.rules = [...rules, ...content.rules]
}

function handleRuleProviders(content, concatPath) {
    const ruleSet = []
    if (content.rules.length > 0) {
        const ruleProviders = getRuleProviders(content, concatPath);
        for (const [index, rule] of content.rules.entries()) {
            const [type, argument, policy] = rule.split(',');
            if (type === 'RULE-SET' && ruleProviders[argument]) {
                ruleSet.push({
                    index: index,
                    rules: ruleProviders[argument].map(o => {
                        const arr = o.split(',');
                        arr.splice(2, 0, policy);
                        return arr.join(',');
                    })
                })
            }
        }
        let lastLength = 0
        for (const r of ruleSet) {
            content.rules.splice(+r.index + lastLength, 1, ...r.rules)
            lastLength += r.rules.length - 1
        }
    }
}

function getRuleProviders(content, concatPath) {
    const ruleProviders = {}
    const providers = content['rule-providers']
    if (providers) {
        for (const key in providers) {
            const fPath = path.join(concatPath, providers[key].path)
            try {
                ruleProviders[key] = yaml.parse(fs.readFileSync(fPath).toString()).payload.map(o => o.split(",").slice(0, 2).join(","))
            } catch (e) {
                error(`read file error: ${fPath}`)
            }
        }
        delete content['rule-providers']
    }
    return ruleProviders;
}
