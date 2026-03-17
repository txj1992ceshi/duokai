// stealth-engine/redis-proxy-pool.js
const Redis = require('ioredis');
const { default: Redlock } = require('redlock');

class RedisProxyPool {
  constructor(options = {}) {
    const redisUrl = options.redisUrl || 'redis://127.0.0.1:6379';
    this.redis = new Redis(redisUrl);
    
    // Configure Redlock for distributed locking
    this.redlock = new Redlock([this.redis], {
      retryCount: 5,
      retryDelay: 200,
      automaticExtensionThreshold: 500
    });

    this.options = {
      lockTtl: 2000,
      blacklistBaseSeconds: 60,
      maxBackoffSeconds: 24 * 3600,
      stickyTTL: 24 * 3600 * 1000,
      ...options
    };
  }

  async addProxies(list) {
    for (const url of list) {
      const existing = await this.redis.hget('duokai:proxies', url);
      if (!existing) {
        await this.redis.hset('duokai:proxies', url, JSON.stringify({
          url, health: 'unknown', lastUsed: 0, failCount: 0, latency: -1
        }));
      }
    }
  }

  async removeProxies(list) {
    if (!list.length) return;
    await this.redis.hdel('duokai:proxies', ...list);
    for (const url of list) {
      await this.redis.hdel('duokai:blacklist', url);
    }
    // Note: Cross-profile sticky cleanup is heavier in Redis (O(N) profiles)
    // We rely on expiration/getProxy cleanup for performance.
  }

  async getProxy(profileId, forceNew = false) {
    const lock = await this.redlock.acquire(['duokai:lock:proxy-pool'], this.options.lockTtl);
    try {
      const now = Date.now();
      
      // 1. Check Sticky
      if (!forceNew) {
        const stickyJson = await this.redis.hget('duokai:sticky', profileId);
        if (stickyJson) {
          const info = JSON.parse(stickyJson);
          if (info.expiresAt > now) {
            const blackJson = await this.redis.hget('duokai:blacklist', info.url);
            const black = blackJson ? JSON.parse(blackJson) : null;
            if (!black || black.until <= now) {
              const pStr = await this.redis.hget('duokai:proxies', info.url);
              if (pStr) {
                const p = JSON.parse(pStr);
                p.lastUsed = now;
                await this.redis.hset('duokai:proxies', info.url, JSON.stringify(p));
                return info.url;
              }
            }
          }
          await this.redis.hdel('duokai:sticky', profileId);
        }
      }

      // 2. Selection logic
      const allRaw = await this.redis.hgetall('duokai:proxies');
      const allProxies = Object.values(allRaw).map(v => JSON.parse(v));
      const blacklistRaw = await this.redis.hgetall('duokai:blacklist');
      
      const candidates = allProxies.filter(p => {
        const b = blacklistRaw[p.url] ? JSON.parse(blacklistRaw[p.url]) : null;
        return p.health !== 'dead' && (!b || b.until <= now);
      });

      let selected = null;
      if (candidates.length > 0) {
        selected = candidates.sort((a, b) => (a.lastUsed || 0) - (b.lastUsed || 0))[0];
      } else if (allProxies.length > 0) {
        // Fallback to least failure if all alive are blacklisted
        selected = allProxies.sort((a, b) => (a.failCount || 0) - (b.failCount || 0))[0];
      }

      if (!selected) return null;

      // 3. Mark and persist
      selected.lastUsed = now;
      await this.redis.hset('duokai:proxies', selected.url, JSON.stringify(selected));
      await this.redis.hset('duokai:sticky', profileId, JSON.stringify({
        url: selected.url,
        expiresAt: now + this.options.stickyTTL
      }));
      
      return selected.url;
    } finally {
      await lock.release().catch(() => {});
    }
  }

  async reportFailure(proxyUrl) {
    const lock = await this.redlock.acquire(['duokai:lock:proxy-pool'], this.options.lockTtl);
    try {
      const pStr = await this.redis.hget('duokai:proxies', proxyUrl);
      const p = pStr ? JSON.parse(pStr) : { url: proxyUrl, health: 'dead', lastUsed: 0, failCount: 0, latency: -1 };
      
      p.failCount = (p.failCount || 0) + 1;
      p.health = (p.failCount >= 3) ? 'dead' : 'sick';
      await this.redis.hset('duokai:proxies', proxyUrl, JSON.stringify(p));

      if (p.health === 'dead') {
        const bStr = await this.redis.hget('duokai:blacklist', proxyUrl);
        const b = bStr ? JSON.parse(bStr) : { attempts: 0, backoffSeconds: this.options.blacklistBaseSeconds };
        
        b.attempts++;
        b.backoffSeconds = Math.min(
          this.options.blacklistBaseSeconds * Math.pow(2, Math.max(0, b.attempts - 1)),
          this.options.maxBackoffSeconds
        );
        b.until = Date.now() + (b.backoffSeconds * 1000);
        await this.redis.hset('duokai:blacklist', proxyUrl, JSON.stringify(b));
        
        // Cleanup this proxy from sticky map (optional but good)
        // O(N) operation in Redis, we skip for high performance unless specifically requested
      }
    } finally {
      await lock.release().catch(() => {});
    }
  }

  async checkAll() {
    // This could be heavy globally, each node normally checks its own range or we use a designated tracker
  }

  async getState() {
    const proxies = Object.values(await this.redis.hgetall('duokai:proxies')).map(v => JSON.parse(v));
    const sticky = Object.entries(await this.redis.hgetall('duokai:sticky')).map(([k, v]) => [k, JSON.parse(v)]);
    const blacklist = Object.entries(await this.redis.hgetall('duokai:blacklist')).map(([k, v]) => [k, JSON.parse(v)]);
    return { proxies, sticky, blacklist };
  }
}

module.exports = RedisProxyPool;
