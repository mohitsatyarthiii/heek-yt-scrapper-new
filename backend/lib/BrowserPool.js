import { chromium } from "playwright";

/**
 * Parse a proxy URL like "http://user:pass@host:port" into Playwright format.
 * Returns { server, username, password } or just { server } if no auth.
 */
function parseProxyUrl(url) {
  try {
    const parsed = new URL(url);
    const proxy = { server: `${parsed.protocol}//${parsed.hostname}:${parsed.port || 80}` };
    if (parsed.username) proxy.username = decodeURIComponent(parsed.username);
    if (parsed.password) proxy.password = decodeURIComponent(parsed.password);
    return proxy;
  } catch {
    return { server: url };
  }
}

/**
 * BrowserPool — Manages a fixed pool of Playwright browser instances.
 * Workers checkout/release browsers instead of launching their own.
 * Prevents resource exhaustion when running N concurrent scrapers.
 *
 * proxyConfig: { url?: string, urls?: string[] }
 *   - url: single rotating proxy endpoint (BrightData, Oxylabs, etc.)
 *   - urls: multiple static proxies for round-robin
 */
export class BrowserPool {
  constructor(maxBrowsers = 3, proxyConfig = null) {
    this.maxBrowsers = maxBrowsers;
    this.browsers = [];      // Array of { browser, inUse: boolean, id: number }
    this.waitQueue = [];     // Resolve functions waiting for a browser
    this.nextId = 0;
    this.initialized = false;

    // Proxy setup
    this.proxyConfig = proxyConfig;
    this.proxyIndex = 0;

    if (proxyConfig?.url) {
      this.parsedProxies = [parseProxyUrl(proxyConfig.url)];
      console.log(`🔒 Proxy configured: rotating (single endpoint)`);
    } else if (proxyConfig?.urls?.length) {
      this.parsedProxies = proxyConfig.urls.map(parseProxyUrl);
      console.log(`🔒 Proxy configured: ${this.parsedProxies.length} static proxies (round-robin)`);
    } else {
      this.parsedProxies = [];
      console.log(`🌐 No proxy configured — using direct connection`);
    }
  }

  /**
   * Get the next proxy in rotation for use with browser.newContext({ proxy }).
   * Returns a Playwright proxy object or undefined if no proxy configured.
   */
  getProxy() {
    if (this.parsedProxies.length === 0) return undefined;
    if (this.parsedProxies.length === 1) return this.parsedProxies[0];
    const proxy = this.parsedProxies[this.proxyIndex % this.parsedProxies.length];
    this.proxyIndex++;
    return proxy;
  }

  async initialize() {
    if (this.initialized) return;

    const BROWSER_ARGS = [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
      "--no-zygote",
    ];

    // Launch browsers in batches of 5 to prevent memory spikes
    const batchSize = 5;
    for (let batch = 0; batch < this.maxBrowsers; batch += batchSize) {
      const count = Math.min(batchSize, this.maxBrowsers - batch);
      const launches = [];
      for (let i = 0; i < count; i++) {
        launches.push(
          chromium.launch({ headless: true, args: BROWSER_ARGS })
            .then(browser => {
              this.browsers.push({ browser, inUse: false, id: this.nextId++ });
            })
            .catch(err => {
              console.error(`Failed to launch browser ${batch + i}:`, err.message);
            })
        );
      }
      await Promise.all(launches);
      if (batch + batchSize < this.maxBrowsers) {
        console.log(`🌐 Browser pool: ${this.browsers.length}/${this.maxBrowsers} launched...`);
      }
    }

    this.initialized = true;
    console.log(`🌐 Browser pool initialized: ${this.browsers.length}/${this.maxBrowsers} browsers ready`);
  }

  /**
   * Checkout a browser from the pool.
   * If none available, waits until one is released.
   * Returns { browser, inUse, id } entry.
   */
  async checkout(timeoutMs = 120000) {
    if (!this.initialized) await this.initialize();

    // Try to find available browser
    const available = this.browsers.find((b) => !b.inUse);
    if (available) {
      available.inUse = true;
      return available;
    }

    // All in use — wait for one to become available
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waitQueue.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waitQueue.splice(idx, 1);
        reject(new Error("Browser checkout timeout — all browsers busy"));
      }, timeoutMs);

      this.waitQueue.push({
        resolve: (entry) => {
          clearTimeout(timer);
          resolve(entry);
        },
      });
    });
  }

  /**
   * Release a browser back to the pool.
   * If someone is waiting, immediately hand it to them.
   */
  release(browserEntry) {
    if (!browserEntry) return;

    browserEntry.inUse = false;

    // If someone is waiting, give them this browser
    if (this.waitQueue.length > 0) {
      const waiter = this.waitQueue.shift();
      browserEntry.inUse = true;
      waiter.resolve(browserEntry);
    }
  }

  /**
   * Replace a crashed browser with a fresh instance.
   */
  async replaceBrowser(browserEntry) {
    const idx = this.browsers.indexOf(browserEntry);
    if (idx === -1) return;

    try {
      await browserEntry.browser.close().catch(() => {});
    } catch { /* already dead */ }

    try {
      const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process", "--no-zygote"],
      });
      this.browsers[idx] = { browser, inUse: false, id: this.nextId++ };
      console.log(`🔄 Browser ${idx} replaced with fresh instance`);
    } catch (err) {
      console.error(`Failed to replace browser ${idx}:`, err.message);
      this.browsers.splice(idx, 1);
    }
  }

  /**
   * Get pool status for monitoring.
   */
  getStatus() {
    return {
      total: this.browsers.length,
      inUse: this.browsers.filter((b) => b.inUse).length,
      available: this.browsers.filter((b) => !b.inUse).length,
      waiting: this.waitQueue.length,
      proxy: this.parsedProxies.length > 0
        ? { enabled: true, count: this.parsedProxies.length, mode: this.parsedProxies.length === 1 ? "rotating" : "round-robin" }
        : { enabled: false },
    };
  }

  /**
   * Shutdown all browsers.
   */
  async shutdown() {
    for (const entry of this.browsers) {
      try {
        await entry.browser.close();
      } catch { /* ignore */ }
    }
    this.browsers = [];
    this.waitQueue = [];
    this.initialized = false;
    console.log("🛑 Browser pool shut down");
  }
}
