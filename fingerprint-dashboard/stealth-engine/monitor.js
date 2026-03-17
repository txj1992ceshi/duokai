/**
 * monitor.js
 * 
 * Monitors active sessions for IP changes, fingerprint consistency,
 * and records auditing logs.
 */

'use strict';

const fs = require('fs');
const path = require('path');

class RuntimeMonitor {
  constructor(auditLogPath) {
    this.auditLogPath = auditLogPath;
    this.logs = [];
  }

  log(sessionId, profileId, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      sessionId,
      profileId,
      ...data
    };
    
    this.logs.push(entry);
    this.persist(entry);
    
    // Alert on IP change or conflict
    if (data.ipChanged) {
      console.error(`[Monitor] 🚨 IP CHANGE DETECTED for session ${sessionId}: ${data.oldIp} -> ${data.newIp}`);
    }
  }

  persist(entry) {
    try {
      const line = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.auditLogPath, line, 'utf-8');
    } catch (e) {
      console.error('[Monitor] Failed to write audit log', e);
    }
  }

  getRecentLogs(limit = 100) {
    return this.logs.slice(-limit);
  }
}

module.exports = RuntimeMonitor;
