import fs from 'fs';
import path from 'path';
import os from 'os';
import type { HostEnvironment, ProxyProtocol, ProxyVerificationRecord } from '@/lib/proxyTypes';

function deriveStructuredProxy(proxy?: string) {
  const empty = {
    proxyType: 'direct' as ProxyProtocol,
    proxyHost: undefined as string | undefined,
    proxyPort: undefined as string | undefined,
    proxyUsername: undefined as string | undefined,
    proxyPassword: undefined as string | undefined,
  };

  if (!proxy) return empty;

  const raw = proxy.trim();

  try {
    const url = new URL(raw);
    const protocol = url.protocol.replace(':', '');
    if (url.hostname && url.port) {
      return {
        proxyType: (protocol === 'https' || protocol === 'socks5' ? protocol : 'http') as ProxyProtocol,
        proxyHost: url.hostname || undefined,
        proxyPort: url.port || undefined,
        proxyUsername: decodeURIComponent(url.username || '') || undefined,
        proxyPassword: decodeURIComponent(url.password || '') || undefined,
      };
    }
  } catch {}

  let match = raw.match(/^(https?|socks5):\/\/([^:]+):(\d+):([^:]+):(.+)$/i);
  if (match) {
    const [, protocol, host, port, username, password] = match;
    return {
      proxyType: (protocol === 'https' || protocol === 'socks5' ? protocol : 'http') as ProxyProtocol,
      proxyHost: host || undefined,
      proxyPort: port || undefined,
      proxyUsername: decodeURIComponent(username) || undefined,
      proxyPassword: decodeURIComponent(password) || undefined,
    };
  }

  match = raw.match(/^([^:]+):(\d+):([^:]+):(.+)$/);
  if (match) {
    const [, host, port, username, password] = match;
    return {
      proxyType: 'http' as ProxyProtocol,
      proxyHost: host || undefined,
      proxyPort: port || undefined,
      proxyUsername: decodeURIComponent(username) || undefined,
      proxyPassword: decodeURIComponent(password) || undefined,
    };
  }

  return empty;
}

export interface Profile {
  id: string;
  name: string;
  status: 'Ready' | 'Running' | 'Error';
  lastActive: string;
  tags: string[];
  proxy?: string; // Optional HTTP/SOCKS5 proxy string
  proxyType?: ProxyProtocol;
  proxyHost?: string;
  proxyPort?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  expectedProxyIp?: string;
  preferredProxyTransport?: ProxyProtocol;
  lastResolvedProxyTransport?: ProxyProtocol;
  lastHostEnvironment?: HostEnvironment;
  ua?: string; // Optional Custom User Agent
  seed?: string; // Seed for deterministic fingerprint generation
  isMobile?: boolean; // Mobile phone profile flag
  groupId?: string; // ID of the group this profile belongs to
  runtimeSessionId?: string; // ID of the active runtime session
  expectedProxyCountry?: string; // Optional expected provider country/region used for strict proxy egress checks
  expectedProxyRegion?: string;
  proxyVerification?: ProxyVerificationRecord; // Last browser-layer verified egress result
  startupPlatform?: string;
  startupUrl?: string;
  startupNavigation?: {
    ok: boolean;
    requestedUrl?: string;
    finalUrl?: string;
    error?: string;
  };
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
  actions: unknown[]; // JSON representation of mouse/keyboard sequences
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
    } catch {
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
    if (Array.isArray(data.profiles)) {
      data.profiles = data.profiles.map((profile: Profile) => {
        const next = { ...profile };
        if (!next.proxyType || !next.proxyHost || !next.proxyPort) {
          const derived = deriveStructuredProxy(next.proxy);
          if (!next.proxyType && derived.proxyType) next.proxyType = derived.proxyType;
          if (!next.proxyHost && derived.proxyHost) next.proxyHost = derived.proxyHost;
          if (!next.proxyPort && derived.proxyPort) next.proxyPort = derived.proxyPort;
          if (!next.proxyUsername && derived.proxyUsername) next.proxyUsername = derived.proxyUsername;
          if (!next.proxyPassword && derived.proxyPassword) next.proxyPassword = derived.proxyPassword;
          modified = true;
        }
        if (!next.preferredProxyTransport && next.proxyType) {
          next.preferredProxyTransport = next.proxyType;
          modified = true;
        }
        return next;
      });
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
