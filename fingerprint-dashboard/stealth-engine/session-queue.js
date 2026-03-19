// stealth-engine/session-queue.js
// Minimal session queue + audit + graceful-exit utility for Playwright runtime.
//
// Usage:
// const createQueue = require('./session-queue');
// const queue = createQueue({ doStart, doStop, saveStorageState, auditFile, maxActiveSessions, sessionTimeoutHours })

const fs = require('fs');
const path = require('path');

function isNonFatalStreamError(err) {
  const message = String(err?.message || err || '');
  return err?.code === 'EIO'
    || err?.code === 'EPIPE'
    || message.includes('write EIO')
    || message.includes('write EPIPE');
}

function appendJsonLine(file, obj) {
  try {
    fs.appendFileSync(file, JSON.stringify(obj) + '\n');
  } catch (_) {}
}

module.exports = function createQueue(opts = {}) {
  const doStart = opts.doStart; // async (payload) => ({ sessionId, ... })
  const doStop = opts.doStop;   // async (sessionId) => void
  const saveStorageState = opts.saveStorageState; // async (sessionId) => void
  const auditFile = opts.auditFile || path.join(process.cwd(), 'runtime-audit.log');
  const MAX = Number(process.env.MAX_ACTIVE_SESSIONS || opts.maxActiveSessions || 6);
  const TIMEOUT_HOURS = Number(process.env.SESSION_TIMEOUT_HOURS || opts.sessionTimeoutHours || 24);
  const CLEANUP_INTERVAL_MS = Number(opts.cleanupIntervalMs || 60 * 1000);

  const queue = [];
  let active = 0;
  const sessions = new Map(); // sessionId -> { startedAt, lastActiveAt, payload }

  function audit(action, data = {}) {
    appendJsonLine(auditFile, { ts: new Date().toISOString(), action, ...data });
  }

  async function processQueue() {
    if (active >= MAX || queue.length === 0) return;
    const item = queue.shift();
    active++;
    audit('start_attempt', { profileId: item.payload?.profileId || item.payload?.profile?.id, queuedAt: item.queuedAt });
    try {
      const res = await doStart(item.payload);
      const sid = res && (res.sessionId || res.id || (res.session && (res.session.sessionId || res.session.id)));
      sessions.set(sid, { startedAt: Date.now(), lastActiveAt: Date.now(), payload: item.payload });
      audit('start_ok', { sessionId: sid, profileId: item.payload?.profileId || item.payload?.profile?.id });
      item.resolve(res);
    } catch (err) {
      audit('start_err', { err: String(err), profileId: item.payload?.profileId || item.payload?.profile?.id });
      item.reject(err);
    } finally {
      active--;
      // allow other tasks to proceed
      setImmediate(processQueue);
    }
  }

  function enqueueStart(payload) {
    return new Promise((resolve, reject) => {
      const MAX_QUEUE = Number(process.env.MAX_QUEUE_LENGTH || 200);
      if (queue.length > MAX_QUEUE) {
        audit('queue_rejected', { profileId: payload?.profileId || payload?.profile?.id, queueLen: queue.length });
        return reject(new Error('queue full'));
      }
      queue.push({ payload, resolve, reject, queuedAt: Date.now() });
      audit('enqueue', { profileId: payload?.profileId || payload?.profile?.id, queueLen: queue.length });
      processQueue();
    });
  }

  async function stopSession(sessionId) {
    audit('stop_request', { sessionId });
    try {
      await doStop(sessionId);
      sessions.delete(sessionId);
      audit('stop_ok', { sessionId });
      return { ok: true };
    } catch (e) {
      audit('stop_err', { sessionId, err: String(e) });
      throw e;
    }
  }

  async function saveAllStates() {
    audit('save_all_start', { count: sessions.size });
    for (const [sid] of Array.from(sessions.entries())) {
      try {
        await saveStorageState(sid);
        audit('save_ok', { sessionId: sid });
      } catch (e) {
        audit('save_err', { sessionId: sid, err: String(e) });
      }
    }
    audit('save_all_done', { count: sessions.size });
  }

  // Auto cleanup for timed out sessions
  setInterval(async () => {
    const now = Date.now();
    for (const [sid, meta] of Array.from(sessions.entries())) {
      const diffHours = (now - meta.lastActiveAt) / (1000 * 60 * 60);
      if (diffHours > TIMEOUT_HOURS) {
        audit('auto_recycle', { sessionId: sid, idleHours: diffHours });
        try { await saveStorageState(sid); } catch (e) { audit('save_err', { sessionId: sid, err: String(e) }); }
        try { await doStop(sid); } catch (e) { audit('stop_err', { sessionId: sid, err: String(e) }); }
        sessions.delete(sid);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  // Graceful exit handlers
  async function gracefulExit() {
    audit('process_exit_begin', { pid: process.pid });
    try { await saveAllStates(); } catch (_) {}
    audit('process_exit_end', { pid: process.pid });
    setTimeout(() => process.exit(0), 500);
  }

  process.on('SIGINT', gracefulExit);
  process.on('SIGTERM', gracefulExit);
  process.on('uncaughtException', async (err) => {
    audit('uncaughtException', { err: String(err) });
    if (isNonFatalStreamError(err)) {
      return;
    }
    try { await saveAllStates(); } catch (_) {}
    process.exit(1);
  });

  // Public API
  return {
    enqueueStart,
    stopSession,
    saveAllStates,
    getActiveCount: () => active,
    getQueueLen: () => queue.length,
    getSessionsMap: () => sessions,
    auditFile,
  };
};
