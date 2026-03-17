/**
 * proxy-pool.js  — Proxy 池（带 sticky TTL + blacklist/backoff + persistence）
 *
 * 主要增强：
 *  - stickyMap 存储 { url, expiresAt }，自动过期回收
 *  - blacklist 保存临时黑名单（until 时间），基于 failCount 做指数退避
 *  - 在关键状态变更时调用 save() 持久化到 ~/.antigravity-browser/proxy-pool.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const os = require('os');

class ProxyPoolManager {
  constructor(options = {}) {
    this.proxies = []; // Array of { url, health, lastUsed, failCount, latency }
    // stickyMap: profileId -> { url, expiresAt }
    this.stickyMap = new Map();
    // blacklist: proxyUrl -> { until: timestamp, backoffSeconds, attempts }
    this.blacklist = new Map();

    this.options = {
      healthCheckUrl: 'http://httpbin.org/ip',
      checkInterval: 5 * 60 * 1000, // 5 minutes
      maxFailures: 3,
      stickyTTL: 24 * 3600 * 1000, // 24 hours
      blacklistBaseSeconds: 60, // base backoff 60s
      maxBackoffSeconds: 24 * 3600, // max backoff 24 hours
      persistencePath: path.join(os.homedir(), '.antigravity-browser', 'proxy-pool.json'),
      cleanupInterval: 60 * 1000,
      saveThrottleMs: 1000, // Debounce save calls
      ...options
    };

    this._saveTimer = null;

    // ensure dir exists
    try { fs.mkdirSync(path.dirname(this.options.persistencePath), { recursive: true }); } catch {}

    // Load persisted state if any
    this.load();

    // Periodic cleanup: expired sticky entries and blacklist expiration
    setInterval(() => this._cleanup(), this.options.cleanupInterval);

    // Periodic health check if desired
    setInterval(() => this.checkAll().catch(() => {}), this.options.checkInterval);
  }

  // ---------- Persistence ----------
  save() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._doSave();
    }, this.options.saveThrottleMs || 1000);
  }

  _doSave() {
    try {
      const data = {
        proxies: this.proxies,
        sticky: Array.from(this.stickyMap.entries()), 
        blacklist: Array.from(this.blacklist.entries()),
        savedAt: new Date().toISOString()
      };
      
      const tmp = this.options.persistencePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tmp, this.options.persistencePath);
    } catch (e) {
      console.warn('[ProxyPool] _doSave() failed', e.message);
    }
  }

  load() {
    try {
      if (!fs.existsSync(this.options.persistencePath)) return;
      const raw = fs.readFileSync(this.options.persistencePath, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data.proxies)) this.proxies = data.proxies;
      if (Array.isArray(data.sticky)) this.stickyMap = new Map(data.sticky);
      if (Array.isArray(data.blacklist)) this.blacklist = new Map(data.blacklist);
    } catch (e) {
      // ignore load errors (don't crash runtime)
      console.warn('[ProxyPool] load() failed', e.message);
    }
  }

  // ---------- Add / Remove ----------
  addProxies(proxyUrls) {
    proxyUrls.forEach(url => {
      if (!this.proxies.find(p => p.url === url)) {
        this.proxies.push({
          url,
          health: 'unknown',
          lastUsed: 0,
          failCount: 0,
          latency: -1
        });
      }
    });
    this.save();
  }

  removeProxies(proxyUrls) {
    this.proxies = this.proxies.filter(p => !proxyUrls.includes(p.url));
    // remove sticky entries using those proxies
    for (const [profileId, info] of Array.from(this.stickyMap.entries())) {
      if (proxyUrls.includes(info.url)) this.stickyMap.delete(profileId);
    }
    // remove from blacklist too
    for (const url of proxyUrls) this.blacklist.delete(url);
    this.save();
  }

  // ---------- Internal cleanup ----------
  _cleanup() {
    const now = Date.now();
    // sticky TTL cleanup
    for (const [profileId, info] of Array.from(this.stickyMap.entries())) {
      if (!info || !info.expiresAt || info.expiresAt <= now) {
        this.stickyMap.delete(profileId);
      }
    }
    // blacklist expiry cleanup
    for (const [url, meta] of Array.from(this.blacklist.entries())) {
      if (meta.until && meta.until <= now) this.blacklist.delete(url);
    }
    // persist occasionally
    this.save();
  }

  // ---------- Get proxy for a profile ----------
  async getProxy(profileId, forceNew = false) {
    const now = Date.now();

    // If sticky exists and not expired and not dead/blacklisted, reuse it
    if (!forceNew && this.stickyMap.has(profileId)) {
      const info = this.stickyMap.get(profileId);
      if (info && info.url && info.expiresAt > now) {
        const p = this.proxies.find(x => x.url === info.url && x.health !== 'dead');
        const black = this.blacklist.get(info.url);
        if (p && (!black || black.until <= now)) {
          p.lastUsed = now;
          this.save();
          return info.url;
        } else {
          // sticky proxy is blacklisted or dead -> remove sticky
          this.stickyMap.delete(profileId);
          this.save();
        }
      } else {
        this.stickyMap.delete(profileId);
        this.save();
      }
    }

    // Filter healthy proxies and not blacklisted
    const healthy = this.proxies.filter(p => p.health !== 'dead' && (!this.blacklist.has(p.url) || (this.blacklist.get(p.url).until <= now)));
    let selected = null;

    if (healthy.length > 0) {
      // choose least recently used among healthy
      selected = healthy.sort((a, b) => a.lastUsed - b.lastUsed)[0];
    } else {
      // fallback: choose least failCount among all non-blacklisted
      const candidates = this.proxies.filter(p => !this.blacklist.has(p.url));
      if (candidates.length > 0) {
        selected = candidates.sort((a, b) => a.failCount - b.failCount)[0];
      } else {
        // final fallback: attempt any proxy (even blacklisted) with earliest expiry
        const earliest = Array.from(this.blacklist.entries()).sort((a, b) => (a[1].until || 0) - (b[1].until || 0))[0];
        if (earliest) {
          selected = this.proxies.find(p => p.url === earliest[0]);
        }
      }
    }

    if (!selected) return null;

    // mark sticky
    this.stickyMap.set(profileId, { url: selected.url, expiresAt: Date.now() + this.options.stickyTTL });
    selected.lastUsed = now;
    this.save();
    return selected.url;
  }

  // ---------- Report failure and implement backoff/blacklist ----------
  reportFailure(proxyUrl) {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (proxy) {
      proxy.failCount = (proxy.failCount || 0) + 1;
      // mark health according to failCount
      if (proxy.failCount >= this.options.maxFailures) {
        proxy.health = 'dead';
      } else {
        proxy.health = 'sick';
      }

      // determine backoff / blacklist if dead
      if (proxy.health === 'dead') {
        const prev = this.blacklist.get(proxyUrl) || { attempts: 0, backoffSeconds: this.options.blacklistBaseSeconds };
        prev.attempts = (prev.attempts || 0) + 1;
        
        // backoff doubles each time attempts increases, capped at maxBackoffSeconds
        const maxBackoff = this.options.maxBackoffSeconds || 24 * 3600;
        const computedBackoff = this.options.blacklistBaseSeconds * Math.pow(2, Math.max(0, prev.attempts - 1));
        prev.backoffSeconds = Math.min(computedBackoff, maxBackoff);
        prev.until = Date.now() + prev.backoffSeconds * 1000;
        
        this.blacklist.set(proxyUrl, prev);
        // clear sticky entries using this proxy
        for (const [profileId, info] of Array.from(this.stickyMap.entries())) {
          if (info.url === proxyUrl) this.stickyMap.delete(profileId);
        }
      }

      // persist changes
      this.save();
    } else {
      // for proxies not in list, add them as dead (defensive)
      this.proxies.push({ url: proxyUrl, health: 'dead', lastUsed: 0, failCount: 1, latency: -1 });
      this.blacklist.set(proxyUrl, { attempts: 1, backoffSeconds: this.options.blacklistBaseSeconds, until: Date.now() + this.options.blacklistBaseSeconds * 1000 });
      this.save();
    }
  }

  // ---------- Health check for all proxies ----------
  async checkAll() {
    // validate proxies in parallel but with limited concurrency to be nice
    const tasks = this.proxies.map(p => this.checkProxy(p));
    await Promise.all(tasks);
    this.save();
  }

  async checkProxy(proxy) {
    const start = Date.now();
    try {
      const result = await this.validateProxy(proxy.url);
      if (result) {
        proxy.health = 'alive';
        proxy.failCount = 0;
        proxy.latency = Date.now() - start;
        // if previously blacklisted, clear it
        if (this.blacklist.has(proxy.url)) this.blacklist.delete(proxy.url);
      } else {
        proxy.failCount = (proxy.failCount || 0) + 1;
        if (proxy.failCount >= this.options.maxFailures) proxy.health = 'dead';
        else proxy.health = 'sick';
      }
    } catch (e) {
      proxy.failCount = (proxy.failCount || 0) + 1;
      if (proxy.failCount >= this.options.maxFailures) proxy.health = 'dead';
      else proxy.health = 'sick';
    }
    this.save();
  }

  validateProxy(proxyUrl) {
    return new Promise((resolve) => {
      try {
        const url = new URL(proxyUrl);
        const agent = url.protocol === 'https:' 
          ? new (require('https-proxy-agent'))(proxyUrl)
          : new (require('http-proxy-agent'))(proxyUrl);

        const client = url.protocol === 'https:' ? https : http;
        const req = client.get(this.options.healthCheckUrl, { agent, timeout: 5000 }, (res) => {
          if (res.statusCode === 200) resolve(true);
          else resolve(false);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  // expose internals for debugging
  getState() {
    return {
      proxies: this.proxies,
      sticky: Array.from(this.stickyMap.entries()),
      blacklist: Array.from(this.blacklist.entries())
    };
  }
}

module.exports = ProxyPoolManager;
