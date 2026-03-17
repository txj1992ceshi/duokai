// tools/migrate-to-sqlite.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const HOME = os.homedir();
const STORAGE_DIR = path.join(HOME, '.antigravity-browser');
const DBPATH = path.join(STORAGE_DIR, 'duokai.db');
const DBJSON = path.join(STORAGE_DIR, 'db.json');
const POOLJSON = path.join(STORAGE_DIR, 'proxy-pool.json');

function loadJson(p) { 
  try { 
    return JSON.parse(fs.readFileSync(p, 'utf-8')); 
  } catch (e) { 
    return null; 
  } 
}

const dbJson = loadJson(DBJSON);
const poolJson = loadJson(POOLJSON);

if (!dbJson && !poolJson) {
  console.error('No JSON files found to migrate.');
  process.exit(1);
}

const db = new Database(DBPATH);

// Schema creation
db.exec(`
  PRAGMA journal_mode = WAL;
  
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY, 
    name TEXT, 
    status TEXT, 
    lastActive TEXT, 
    tags TEXT, 
    proxy TEXT, 
    ua TEXT, 
    seed TEXT, 
    isMobile INTEGER, 
    groupId TEXT, 
    runtimeSessionId TEXT
  );
  
  CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY, 
    name TEXT, 
    color TEXT
  );
  
  CREATE TABLE IF NOT EXISTS behaviors (
    id TEXT PRIMARY KEY, 
    name TEXT, 
    description TEXT, 
    actions TEXT
  );
  
  CREATE TABLE IF NOT EXISTS settings (
    k TEXT PRIMARY KEY, 
    v TEXT
  );
  
  CREATE TABLE IF NOT EXISTS proxies (
    url TEXT PRIMARY KEY, 
    health TEXT, 
    lastUsed INTEGER, 
    failCount INTEGER, 
    latency INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS sticky (
    profileId TEXT PRIMARY KEY, 
    url TEXT, 
    expiresAt INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS blacklist (
    url TEXT PRIMARY KEY, 
    attempts INTEGER, 
    backoffSeconds INTEGER, 
    until INTEGER
  );
`);

const insertProfile = db.prepare('INSERT OR REPLACE INTO profiles (id,name,status,lastActive,tags,proxy,ua,seed,isMobile,groupId,runtimeSessionId) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
const insertGroup = db.prepare('INSERT OR REPLACE INTO groups (id,name,color) VALUES (?,?,?)');
const insertBehavior = db.prepare('INSERT OR REPLACE INTO behaviors (id,name,description,actions) VALUES (?,?,?,?)');
const insertSetting = db.prepare('INSERT OR REPLACE INTO settings (k,v) VALUES (?,?)');
const insertProxy = db.prepare('INSERT OR REPLACE INTO proxies (url,health,lastUsed,failCount,latency) VALUES (?,?,?,?,?)');
const insertSticky = db.prepare('INSERT OR REPLACE INTO sticky (profileId,url,expiresAt) VALUES (?,?,?)');
const insertBlacklist = db.prepare('INSERT OR REPLACE INTO blacklist (url,attempts,backoffSeconds,until) VALUES (?,?,?,?)');

const tx = db.transaction(() => {
  // Migrate Dashboard Data
  if (dbJson) {
    for (const p of (dbJson.profiles || [])) {
      insertProfile.run(p.id, p.name, p.status || 'Ready', p.lastActive || '', JSON.stringify(p.tags || []), p.proxy || '', p.ua || '', p.seed || '', p.isMobile ? 1 : 0, p.groupId || null, p.runtimeSessionId || '');
    }
    for (const g of (dbJson.groups || [])) insertGroup.run(g.id, g.name, g.color);
    for (const b of (dbJson.behaviors || [])) insertBehavior.run(b.id, b.name, b.description || '', JSON.stringify(b.actions || []));
    if (dbJson.settings) {
      for (const [k, v] of Object.entries(dbJson.settings)) insertSetting.run(k, JSON.stringify(v));
    }
  }

  // Migrate Proxy Data
  if (poolJson) {
    for (const p of (poolJson.proxies || [])) {
      insertProxy.run(p.url, p.health || 'unknown', p.lastUsed || 0, p.failCount || 0, p.latency || -1);
    }
    const stickyEntries = Array.isArray(poolJson.sticky) ? poolJson.sticky : [];
    for (const [profileId, info] of stickyEntries) {
      insertSticky.run(profileId, info.url, info.expiresAt || 0);
    }
    const blacklistEntries = Array.isArray(poolJson.blacklist) ? poolJson.blacklist : [];
    for (const [url, meta] of blacklistEntries) {
      insertBlacklist.run(url, meta.attempts || 0, meta.backoffSeconds || 0, meta.until || 0);
    }
  }
});

try {
  tx();
  console.log('✅ Migration completed successfully.');
  console.log('Database path:', DBPATH);
} catch (err) {
  console.error('❌ Migration failed:', err);
} finally {
  db.close();
}
