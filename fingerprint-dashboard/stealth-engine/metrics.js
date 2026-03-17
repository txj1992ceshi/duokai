// stealth-engine/metrics.js
const client = require('prom-client');
const register = client.register;

// Metrics definitions
const proxyAliveGauge = new client.Gauge({ name: 'duokai_proxy_alive', help: 'Count of alive proxies' });
const proxySickGauge  = new client.Gauge({ name: 'duokai_proxy_sick', help: 'Count of sick proxies' });
const proxyDeadGauge  = new client.Gauge({ name: 'duokai_proxy_dead', help: 'Count of dead proxies' });
const proxyFailTotal  = new client.Counter({ name: 'duokai_proxy_fail_total', help: 'Total proxy failures reported' });
const proxyVerified   = new client.Counter({ name: 'duokai_proxy_verified_total', help: 'Total proxy verified success' });
const proxyVerifiedFail = new client.Counter({ name: 'duokai_proxy_verified_fail_total', help: 'Total proxy verified failed' });

const stickyGauge = new client.Gauge({ name: 'duokai_sticky_count', help: 'Current sticky map entries' });
const blacklistGauge = new client.Gauge({ name: 'duokai_blacklist_count', help: 'Current blacklist entries' });

const activeSessionsGauge = new client.Gauge({ name: 'duokai_active_sessions', help: 'Currently active sessions' });
const sessionStartsTotal = new client.Counter({ name: 'duokai_session_starts_total', help: 'Total session starts attempted' });
const uaMismatchTotal = new client.Counter({ name: 'duokai_ua_version_mismatch_total', help: 'Total UA/Chromium version mismatch events' });

/**
 * Update gauge metrics from a proxyPool instance's state
 */
function updateProxyMetrics(proxyPool) {
  if (!proxyPool || typeof proxyPool.getState !== 'function') return;
  const state = proxyPool.getState();
  const proxies = state.proxies || [];
  
  proxyAliveGauge.set(proxies.filter(p => p.health === 'alive').length);
  proxySickGauge.set(proxies.filter(p => p.health === 'sick').length);
  proxyDeadGauge.set(proxies.filter(p => p.health === 'dead').length);
  
  stickyGauge.set(Array.isArray(state.sticky) ? state.sticky.length : 0);
  blacklistGauge.set(Array.isArray(state.blacklist) ? state.blacklist.length : 0);
}

/**
 * HTTP handler for Prometheus /metrics
 */
async function metricsHandler(req, res, { proxyPool, sessionsMap }) {
  try {
    // Refresh dynamic metrics before response
    updateProxyMetrics(proxyPool);
    activeSessionsGauge.set(sessionsMap instanceof Map ? sessionsMap.size : 0);
    
    const metrics = await register.metrics();
    res.writeHead(200, { 'Content-Type': register.contentType });
    res.end(metrics);
  } catch (e) {
    console.error('[Metrics] Collection Error:', e);
    res.writeHead(500);
    res.end(e.message);
  }
}

// Event hooks to be called from runtime logic
function onProxyFailure() { proxyFailTotal.inc(); }
function onProxyVerified(ok) { if (ok) proxyVerified.inc(); else proxyVerifiedFail.inc(); }
function onSessionStart() { sessionStartsTotal.inc(); }
function onUaMismatch() { uaMismatchTotal.inc(); }

module.exports = {
  metricsHandler,
  updateProxyMetrics,
  onProxyFailure,
  onProxyVerified,
  onSessionStart,
  onUaMismatch
};
