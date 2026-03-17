/**
 * proxy-pool.js
 * 
 * Manages a pool of proxies, performs health checks, handles sticky IP logic,
 * and provides failure recovery/rate-limiting.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

class ProxyPoolManager {
  constructor(options = {}) {
    this.proxies = []; // Array of { url, health, lastUsed, failCount, stickyId }
    this.stickyMap = new Map(); // profileId -> proxyUrl
    this.options = {
      healthCheckUrl: 'http://httpbin.org/ip',
      checkInterval: 5 * 60 * 1000, // 5 minutes
      maxFailures: 3,
      ...options
    };
    
    this.loadLock = false;
  }

  /**
   * Add proxies to the pool
   * @param {string[]} proxyUrls - List of proxy URLs (http://user:pass@host:port)
   */
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
  }

  /**
   * Get a proxy for a profile, ensuring sticky IP if requested
   */
  async getProxy(profileId, forceNew = false) {
    if (!forceNew && this.stickyMap.has(profileId)) {
      const stickyUrl = this.stickyMap.get(profileId);
      const proxy = this.proxies.find(p => p.url === stickyUrl && p.health !== 'dead');
      if (proxy) {
        proxy.lastUsed = Date.now();
        return proxy.url;
      }
    }

    // Filter healthy proxies
    const healthy = this.proxies.filter(p => p.health !== 'dead');
    if (healthy.length === 0) {
      if (this.proxies.length > 0) {
        // Fallback to least failed if none are "healthy"
        const fallback = this.proxies.sort((a, b) => a.failCount - b.failCount)[0];
        this.stickyMap.set(profileId, fallback.url);
        return fallback.url;
      }
      return null;
    }

    // Selection logic: least recently used or random
    const selected = healthy.sort((a, b) => a.lastUsed - b.lastUsed)[0];
    selected.lastUsed = Date.now();
    this.stickyMap.set(profileId, selected.url);
    
    return selected.url;
  }

  /**
   * Mark a proxy as failed
   */
  reportFailure(proxyUrl) {
    const proxy = this.proxies.find(p => p.url === proxyUrl);
    if (proxy) {
      proxy.failCount++;
      if (proxy.failCount >= this.options.maxFailures) {
        proxy.health = 'dead';
        console.warn(`[ProxyPool] Proxy marked as DEAD: ${proxyUrl}`);
      }
    }
  }

  /**
   * Health check all proxies
   */
  async checkAll() {
    console.log(`[ProxyPool] Starting health check for ${this.proxies.length} proxies...`);
    const tasks = this.proxies.map(p => this.checkProxy(p));
    await Promise.all(tasks);
    console.log(`[ProxyPool] Health check complete. Healthy: ${this.proxies.filter(p => p.health === 'alive').length}`);
  }

  async checkProxy(proxy) {
    const start = Date.now();
    try {
      const result = await this.validateProxy(proxy.url);
      if (result) {
        proxy.health = 'alive';
        proxy.failCount = 0;
        proxy.latency = Date.now() - start;
      } else {
        throw new Error('Validation failed');
      }
    } catch (e) {
      proxy.failCount++;
      if (proxy.failCount >= this.options.maxFailures) {
        proxy.health = 'dead';
      } else {
        proxy.health = 'sick';
      }
    }
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
}

module.exports = ProxyPoolManager;
