import puppeteer from 'puppeteer';

/** 浏览器空闲回收超时默认值 (毫秒)：超过该时间未发起请求则自动关闭浏览器释放资源 */
const DEFAULT_IDLE_TIMEOUT = 5 * 60 * 1000;

/** 页面默认视口尺寸 */
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };

/** 默认 User-Agent 标识 */
const DEFAULT_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

/** 浏览器启动的基础参数 (容器环境必需) */
const BASE_LAUNCH_ARGS = ['--no-sandbox', '--disable-setuid-sandbox'];

/**
 * 爬虫浏览器单例管理器
 * 内部持有一个长驻的 Puppeteer Browser 实例，采用「惰性启动 + 空闲超时自动回收」策略：
 * 每次打开页面都会重置空闲计时器，长时间无请求时自动关闭浏览器，释放内存与进程句柄。
 * 配置读取自 `browser` 节点 (代理缺省回退到 `axios.proxy`)：
 * ```
 * browser:
 *   headless: true                 # 是否无头模式 (默认 true，等价新版无头)
 *   idleTimeout: 300000            # 空闲回收毫秒数，<= 0 表示不自动回收
 *   proxy: http://host:port        # 代理地址，支持字符串或 { protocol, host, port }，传 false 关闭
 *   args: []                      # 追加的浏览器启动参数
 * ```
 */
class CrawlerBrowser {
    /** @type {CrawlerBrowser} 单例实例 */
    static instance = new CrawlerBrowser();

    /** @type {import('puppeteer').Browser|null} 当前持有的浏览器实例 */
    #browser = null;

    /** @type {Promise<import('puppeteer').Browser>|null} 启动中的浏览器 Promise (避免并发重复启动) */
    #launching = null;

    /** @type {NodeJS.Timeout|null} 空闲回收定时器 */
    #idleTimer = null;

    /** @type {number} 空闲回收超时时间 (毫秒)，<= 0 表示不自动回收 */
    #idleTimeout;

    constructor() {
        this.#idleTimeout = this.#getConfig().idleTimeout ?? DEFAULT_IDLE_TIMEOUT;
    }

    /**
     * 读取浏览器配置项
     * @returns {object}
     */
    #getConfig() {
        return __env?.get?.('browser', {}) ?? {};
    }

    /**
     * 解析代理服务器地址，支持字符串或 { protocol, host, port } 对象
     * @param {object} config - 浏览器配置项
     * @returns {string|null}
     */
    #resolveProxyUrl(config) {
        const proxy = config.proxy === undefined ? __env?.get?.('axios.proxy') : config.proxy;
        if (!proxy) return null;
        if (typeof proxy === 'string') return proxy;
        const { protocol = 'http', host, port } = proxy;
        return host ? `${protocol}://${host}${port ? `:${port}` : ''}` : null;
    }

    /**
     * 组装浏览器启动参数
     * @param {object} config - 浏览器配置项
     * @returns {string[]}
     */
    #resolveLaunchArgs(config) {
        const args = [...BASE_LAUNCH_ARGS, ...(config.args ?? [])];
        const proxyUrl = this.#resolveProxyUrl(config);
        if (proxyUrl) args.push(`--proxy-server=${proxyUrl}`);
        return args;
    }

    /**
     * 启动一个新的 Puppeteer 浏览器实例 (惰性调用)
     * @returns {Promise<import('puppeteer').Browser>}
     */
    async #launch() {
        const config = this.#getConfig();
        const browser = await puppeteer.launch({
            headless: config.headless ?? true,
            args: this.#resolveLaunchArgs(config),
        });
        browser.on('disconnected', () => {
            if (this.#browser === browser) this.#browser = null;
            this.#clearIdleTimer();
        });
        __log.info('[CrawlerBrowser] Browser launched.');
        return browser;
    }

    /**
     * 获取可用浏览器实例，必要时惰性启动，并重置空闲回收计时
     * @returns {Promise<import('puppeteer').Browser>}
     */
    async #acquire() {
        this.#resetIdleTimer();
        if (this.#browser?.connected) return this.#browser;
        this.#launching ??= this.#launch();
        try {
            this.#browser = await this.#launching;
            return this.#browser;
        } finally {
            this.#launching = null;
        }
    }

    /**
     * 重置空闲回收定时器
     */
    #resetIdleTimer() {
        this.#clearIdleTimer();
        if (!(this.#idleTimeout > 0)) return;
        this.#idleTimer = setTimeout(() => {
            __log.info('[CrawlerBrowser] Idle timeout reached, closing browser.');
            this.close();
        }, this.#idleTimeout);
        this.#idleTimer.unref?.();
    }

    /**
     * 清除空闲回收定时器
     */
    #clearIdleTimer() {
        if (this.#idleTimer) {
            clearTimeout(this.#idleTimer);
            this.#idleTimer = null;
        }
    }

    /**
     * 打开目标 URL 并执行页面内回调，自动管理 Page 的创建与释放
     * @template T
     * @param {string} url - 目标页面地址
     * @param {((...args: any[]) => T)} [callback] - 在浏览器页面上下文中执行的函数 (page.evaluate)
     * @param {{ viewport?: { width: number, height: number }, userAgent?: string, waitUntil?: string, waitSelector?: string }} [options] - 页面级可选配置
     * @returns {Promise<Awaited<T>|null>} 回调执行结果，失败时返回 null
     */
    async openURL(url, callback, options = {}) {
        const {
            viewport = DEFAULT_VIEWPORT,
            userAgent = DEFAULT_USER_AGENT,
            waitUntil = 'networkidle2',
            waitSelector = 'body',
        } = options;
        let page = null;
        try {
            const browser = await this.#acquire();
            page = await browser.newPage();
            await page.setViewport(viewport);
            await page.setUserAgent(userAgent);
            __log.debug(`[CrawlerBrowser] Open URL: ${url}`);
            await page.goto(url, { waitUntil });
            if (waitSelector) await page.waitForSelector(waitSelector);
            return callback ? await page.evaluate(callback) : null;
        } catch (error) {
            __log.error(`[CrawlerBrowser] Open URL[${url}] and handle failed.`, error?.message ?? error);
            return null;
        } finally {
            await page?.close().catch(() => { });
            this.#resetIdleTimer();
        }
    }

    /**
     * 获取底层浏览器实例 (未启动或已断开时返回 null)
     * @returns {import('puppeteer').Browser|null}
     */
    getBrowser() {
        return this.#browser?.connected ? this.#browser : null;
    }

    /**
     * 关闭浏览器并清理定时器
     * @returns {Promise<void>}
     */
    async close() {
        this.#clearIdleTimer();
        const browser = this.#browser;
        this.#browser = null;
        if (!browser) return;
        try {
            await browser.close();
            __log.info('[CrawlerBrowser] Browser closed.');
        } catch (error) {
            __log.warn('[CrawlerBrowser] Browser close failed.', error?.message ?? error);
        }
    }
}

/** 爬虫浏览器快捷单例操作入口 */
export const crawlerBrowser = {
    /**
     * 打开 URL 并在页面上下文中执行回调
     * @template T
     * @param {string} url - 目标页面地址
     * @param {((...args: any[]) => T)} [callback] - 页面上下文回调函数 (page.evaluate)
     * @param {{ viewport?: { width: number, height: number }, userAgent?: string, waitUntil?: string, waitSelector?: string }} [options] - 页面级可选配置
     * @returns {Promise<Awaited<T>|null>}
     */
    openURL: (url, callback, options) => CrawlerBrowser.instance.openURL(url, callback, options),
    /** 获取底层浏览器实例 */
    getBrowser: () => CrawlerBrowser.instance.getBrowser(),
    /** 关闭浏览器并释放资源 */
    close: () => CrawlerBrowser.instance.close(),
};

/**
 * 获取全局爬虫浏览器单例实例
 * @returns {CrawlerBrowser}
 */
export function getCrawlerBrowser() {
    return CrawlerBrowser.instance;
}
