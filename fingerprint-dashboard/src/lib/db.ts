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
}

export interface DbSchema {
  profiles: Profile[];
}

const DB_DIR = path.join(os.homedir(), '.antigravity-browser');
const DB_PATH = path.join(DB_DIR, 'db.json');

// Initialize DB if not exists
const initDb = () => {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ profiles: [] }, null, 2), 'utf-8');
  }
};

export const getDb = (): DbSchema => {
  initDb();
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading DB:', error);
    return { profiles: [] };
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
