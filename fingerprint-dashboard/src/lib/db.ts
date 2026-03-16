import fs from 'fs';
import path from 'path';
import os from 'os';

export interface Profile {
  id: string;
  name: string;
  status: 'Ready' | 'Running' | 'Error';
  lastActive: string;
  tags: string[];
  proxy?: string; // Optional HTTP/SOCKS5 proxy string
  ua?: string; // Optional Custom User Agent
  seed?: string; // Seed for deterministic fingerprint generation
  isMobile?: boolean; // Mobile phone profile flag
  groupId?: string; // ID of the group this profile belongs to
  runtimeSessionId?: string; // ID of the active runtime session
}

export interface Group {
  id: string;
  name: string;
  color: string;
}

export interface Behavior {
  id: string;
  name: string;
  description?: string;
  actions: any[]; // JSON representation of mouse/keyboard sequences
}

export interface Settings {
  runtimeUrl: string;
  runtimeApiKey: string;
}

export interface DbSchema {
  profiles: Profile[];
  groups: Group[];
  behaviors: Behavior[];
  settings: Settings;
}

const DB_DIR = path.join(os.homedir(), '.antigravity-browser');
const DB_PATH = path.join(DB_DIR, 'db.json');

// Initialize DB if not exists
const initDb = () => {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  const defaultGroups = [
    { id: '1', name: 'Facebook 业务组', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    { id: '2', name: 'Amazon 运营组', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
    { id: '3', name: '默认分组', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20' }
  ];
  const defaultSettings = { runtimeUrl: 'http://127.0.0.1:3001', runtimeApiKey: '' };

  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ 
      profiles: [],
      groups: defaultGroups,
      behaviors: [],
      settings: defaultSettings,
    }, null, 2), 'utf-8');
  } else {
    // Migration for existing DBs
    let data;
    try {
      data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch (e) {
      data = { profiles: [], groups: [], behaviors: [], settings: defaultSettings };
    }
    let modified = false;
    if (!data.groups) {
      data.groups = defaultGroups;
      modified = true;
    }
    if (!data.behaviors) {
      data.behaviors = [];
      modified = true;
    }
    if (!data.settings) {
      data.settings = defaultSettings;
      modified = true;
    }
    if (modified) {
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    }
  }
};

export const getDb = (): DbSchema => {
  initDb();
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading DB:', error);
    return { 
      profiles: [], 
      groups: [], 
      behaviors: [], 
      settings: { runtimeUrl: 'http://127.0.0.1:3001', runtimeApiKey: '' } 
    };
  }
};

export const saveDb = (data: DbSchema) => {
  initDb();
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error writing DB:', error);
  }
};
