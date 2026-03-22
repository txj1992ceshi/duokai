import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { App } from 'electron'
import { cloneName, createDefaultFingerprint, normalizeFingerprintConfig } from './factories'
import type {
  CloudPhoneRecord,
  DashboardSummary,
  ExportBundle,
  FingerprintConfig,
  ImportResult,
  LogEntry,
  LogLevel,
  ProfileRecord,
  ProxyRecord,
  SettingsPayload,
  TemplateRecord,
  RemoteConfigSnapshot,
  UpdateCloudPhoneInput,
  UpdateProfileInput,
  UpdateProxyInput,
  UpdateTemplateInput,
} from '../../src/shared/types'
import { DEFAULT_ENVIRONMENT_LANGUAGE } from '../../src/shared/environmentLanguages'

type ProfileRow = {
  id: string
  name: string
  proxy_id: string | null
  group_name: string
  notes: string
  status: ProfileRecord['status']
  last_started_at: string | null
  created_at: string
  updated_at: string
  tags: string
  fingerprint_config: string
}

type TemplateRow = {
  id: string
  name: string
  proxy_id: string | null
  group_name: string
  notes: string
  created_at: string
  updated_at: string
  tags: string
  fingerprint_config: string
}

type ProxyRow = {
  id: string
  name: string
  type: ProxyRecord['type']
  host: string
  port: number
  username: string
  password: string
  status: ProxyRecord['status']
  last_checked_at: string | null
  created_at: string
  updated_at: string
}

type LogRow = {
  id: string
  level: LogLevel
  category: LogEntry['category']
  message: string
  profile_id: string | null
  created_at: string
}

type CloudPhoneRow = {
  id: string
  name: string
  group_name: string
  tags: string
  notes: string
  platform: 'android'
  provider_key: string
  provider_kind: CloudPhoneRecord['providerKind']
  provider_config: string
  provider_instance_id: string | null
  compute_type: CloudPhoneRecord['computeType']
  status: CloudPhoneRecord['status']
  last_synced_at: string | null
  ip_lookup_channel: string
  proxy_type: CloudPhoneRecord['proxyType']
  ip_protocol: CloudPhoneRecord['ipProtocol']
  proxy_host: string
  proxy_port: number
  proxy_username: string
  proxy_password: string
  udp_enabled: number
  fingerprint_settings: string
  created_at: string
  updated_at: string
}

type CountRow = { count: number }

export class DatabaseService {
  private readonly db: Database.Database

  constructor(app: App) {
    const userDataDir = app.getPath('userData')
    mkdirSync(userDataDir, { recursive: true })
    const dbPath = path.join(userDataDir, 'bitbrowser-clone.sqlite')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.initialize()
    this.seedSettings()
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        proxy_id TEXT,
        group_name TEXT NOT NULL,
        tags TEXT NOT NULL,
        notes TEXT NOT NULL,
        fingerprint_config TEXT NOT NULL,
        status TEXT NOT NULL,
        last_started_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        proxy_id TEXT,
        group_name TEXT NOT NULL,
        tags TEXT NOT NULL,
        notes TEXT NOT NULL,
        fingerprint_config TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS proxies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        host TEXT NOT NULL,
        port INTEGER NOT NULL,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        status TEXT NOT NULL,
        last_checked_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS cloud_phones (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        group_name TEXT NOT NULL,
        tags TEXT NOT NULL,
        notes TEXT NOT NULL,
        platform TEXT NOT NULL,
        provider_key TEXT NOT NULL,
        provider_kind TEXT NOT NULL DEFAULT 'mock',
        provider_config TEXT NOT NULL DEFAULT '{}',
        provider_instance_id TEXT,
        compute_type TEXT NOT NULL,
        status TEXT NOT NULL,
        last_synced_at TEXT,
        ip_lookup_channel TEXT NOT NULL,
        proxy_type TEXT NOT NULL,
        ip_protocol TEXT NOT NULL,
        proxy_host TEXT NOT NULL,
        proxy_port INTEGER NOT NULL,
        proxy_username TEXT NOT NULL,
        proxy_password TEXT NOT NULL,
        udp_enabled INTEGER NOT NULL,
        fingerprint_settings TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        level TEXT NOT NULL,
        category TEXT NOT NULL,
        message TEXT NOT NULL,
        profile_id TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
    this.ensureColumn('profiles', 'sync_version', `INTEGER NOT NULL DEFAULT 0`)
    this.ensureColumn('templates', 'sync_version', `INTEGER NOT NULL DEFAULT 0`)
    this.ensureColumn('proxies', 'sync_version', `INTEGER NOT NULL DEFAULT 0`)
    this.ensureColumn('cloud_phones', 'sync_version', `INTEGER NOT NULL DEFAULT 0`)
    this.ensureColumn('cloud_phones', 'provider_kind', `TEXT NOT NULL DEFAULT 'mock'`)
    this.ensureColumn('cloud_phones', 'provider_config', `TEXT NOT NULL DEFAULT '{}'`)
  }

  private ensureColumn(table: string, column: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
    if (!columns.some((item) => item.name === column)) {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
    }
  }

  private seedSettings(): void {
    const now = new Date().toISOString()
    const stmt = this.db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
    stmt.run('uiLanguage', 'zh-CN')
    stmt.run('defaultEnvironmentLanguage', DEFAULT_ENVIRONMENT_LANGUAGE)
    stmt.run('workspaceName', 'Bit Clone Workspace')
    stmt.run('defaultHomePage', 'https://example.com')
    stmt.run('notes', `Initialized at ${now}`)
    stmt.run('defaultCloudPhoneProvider', 'self-hosted')
    stmt.run('selfHostedCloudPhoneBaseUrl', '')
    stmt.run('selfHostedCloudPhoneApiKey', '')
    stmt.run('selfHostedCloudPhoneClusterId', '')
    stmt.run('thirdPartyCloudPhoneVendor', '')
    stmt.run('thirdPartyCloudPhoneBaseUrl', '')
    stmt.run('thirdPartyCloudPhoneToken', '')
    stmt.run('runtimeMaxConcurrentStarts', '2')
    stmt.run('runtimeMaxActiveProfiles', '6')
    stmt.run('runtimeMaxLaunchRetries', '2')
    stmt.run('localEmulatorAdbPath', 'adb')
  }

  private mapProfile(row: ProfileRow): ProfileRecord {
    return {
      id: row.id,
      name: row.name,
      proxyId: row.proxy_id,
      groupName: row.group_name,
      tags: JSON.parse(row.tags) as string[],
      notes: row.notes,
      fingerprintConfig: normalizeFingerprintConfig(
        JSON.parse(row.fingerprint_config) as FingerprintConfig,
      ),
      status: row.status,
      lastStartedAt: row.last_started_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapTemplate(row: TemplateRow): TemplateRecord {
    return {
      id: row.id,
      name: row.name,
      proxyId: row.proxy_id,
      groupName: row.group_name,
      tags: JSON.parse(row.tags) as string[],
      notes: row.notes,
      fingerprintConfig: normalizeFingerprintConfig(
        JSON.parse(row.fingerprint_config) as FingerprintConfig,
      ),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapProxy(row: ProxyRow): ProxyRecord {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      host: row.host,
      port: row.port,
      username: row.username,
      password: row.password,
      status: row.status,
      lastCheckedAt: row.last_checked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapLog(row: LogRow): LogEntry {
    return {
      id: row.id,
      level: row.level,
      category: row.category,
      message: row.message,
      profileId: row.profile_id,
      createdAt: row.created_at,
    }
  }

  private mapCloudPhone(row: CloudPhoneRow): CloudPhoneRecord {
    return {
      id: row.id,
      name: row.name,
      groupName: row.group_name,
      tags: JSON.parse(row.tags) as string[],
      notes: row.notes,
      platform: row.platform,
      providerKey: row.provider_key,
      providerKind: row.provider_kind ?? 'mock',
      providerConfig: JSON.parse(row.provider_config || '{}') as CloudPhoneRecord['providerConfig'],
      providerInstanceId: row.provider_instance_id,
      computeType: row.compute_type,
      status: row.status,
      lastSyncedAt: row.last_synced_at,
      ipLookupChannel: row.ip_lookup_channel,
      proxyType: row.proxy_type,
      ipProtocol: row.ip_protocol,
      proxyHost: row.proxy_host,
      proxyPort: row.proxy_port,
      proxyUsername: row.proxy_username,
      proxyPassword: row.proxy_password,
      udpEnabled: Boolean(row.udp_enabled),
      fingerprintSettings: JSON.parse(row.fingerprint_settings) as CloudPhoneRecord['fingerprintSettings'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private insertProfile(input: UpdateProfileInput, status: ProfileRecord['status'] = 'stopped'): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO profiles (
          id, name, proxy_id, group_name, tags, notes, fingerprint_config,
          status, last_started_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.name,
        input.proxyId,
        input.groupName,
        JSON.stringify(input.tags),
        input.notes,
        JSON.stringify(input.fingerprintConfig ?? createDefaultFingerprint()),
        status,
        null,
        now,
        now,
      )
  }

  private insertTemplate(input: UpdateTemplateInput): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO templates (
          id, name, proxy_id, group_name, tags, notes, fingerprint_config, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.name,
        input.proxyId,
        input.groupName,
        JSON.stringify(input.tags),
        input.notes,
        JSON.stringify(input.fingerprintConfig ?? createDefaultFingerprint()),
        now,
        now,
      )
  }

  private insertProxy(input: UpdateProxyInput): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO proxies (
          id, name, type, host, port, username, password, status, last_checked_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.name,
        input.type,
        input.host,
        input.port,
        input.username,
        input.password,
        'unknown',
        null,
        now,
        now,
      )
  }

  private insertCloudPhone(input: UpdateCloudPhoneInput, status: CloudPhoneRecord['status']): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO cloud_phones (
          id, name, group_name, tags, notes, platform, provider_key, provider_kind, provider_config, provider_instance_id,
          compute_type, status, last_synced_at, ip_lookup_channel, proxy_type, ip_protocol,
          proxy_host, proxy_port, proxy_username, proxy_password, udp_enabled, fingerprint_settings,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.name,
        input.groupName,
        JSON.stringify(input.tags),
        input.notes,
        input.platform,
        input.providerKey,
        input.providerKind,
        JSON.stringify(input.providerConfig ?? {}),
        'providerInstanceId' in input ? input.providerInstanceId ?? null : null,
        input.computeType,
        status,
        null,
        input.ipLookupChannel,
        input.proxyType,
        input.ipProtocol,
        input.proxyHost,
        input.proxyPort,
        input.proxyUsername,
        input.proxyPassword,
        input.udpEnabled ? 1 : 0,
        JSON.stringify(input.fingerprintSettings),
        now,
        now,
      )
  }

  private getUniqueName(name: string, existingNames: Set<string>): string {
    if (!existingNames.has(name)) {
      return name
    }
    let nextIndex = 2
    let candidate = `${name} ${nextIndex}`
    while (existingNames.has(candidate)) {
      nextIndex += 1
      candidate = `${name} ${nextIndex}`
    }
    return candidate
  }

  listProfiles(): ProfileRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM profiles ORDER BY datetime(created_at) DESC`)
      .all() as ProfileRow[]
    return rows.map((row) => this.mapProfile(row))
  }

  listCloudPhones(): CloudPhoneRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM cloud_phones ORDER BY datetime(created_at) DESC`)
      .all() as CloudPhoneRow[]
    return rows.map((row) => this.mapCloudPhone(row))
  }

  getCloudPhoneById(id: string): CloudPhoneRecord | null {
    const row = this.db.prepare(`SELECT * FROM cloud_phones WHERE id = ?`).get(id) as
      | CloudPhoneRow
      | undefined
    return row ? this.mapCloudPhone(row) : null
  }

  createCloudPhone(input: UpdateCloudPhoneInput): CloudPhoneRecord {
    this.insertCloudPhone(input, 'provisioned')
    return this.getCloudPhoneById(input.id)!
  }

  updateCloudPhone(input: UpdateCloudPhoneInput): CloudPhoneRecord {
    const existing = this.getCloudPhoneById(input.id)
    if (!existing) {
      return this.createCloudPhone(input)
    }
    this.db
      .prepare(
        `UPDATE cloud_phones
         SET name = ?, group_name = ?, tags = ?, notes = ?, platform = ?, provider_key = ?, provider_kind = ?, provider_config = ?, compute_type = ?,
             ip_lookup_channel = ?, proxy_type = ?, ip_protocol = ?, proxy_host = ?, proxy_port = ?,
             proxy_username = ?, proxy_password = ?, udp_enabled = ?, fingerprint_settings = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name,
        input.groupName,
        JSON.stringify(input.tags),
        input.notes,
        input.platform,
        input.providerKey,
        input.providerKind,
        JSON.stringify(input.providerConfig ?? {}),
        input.computeType,
        input.ipLookupChannel,
        input.proxyType,
        input.ipProtocol,
        input.proxyHost,
        input.proxyPort,
        input.proxyUsername,
        input.proxyPassword,
        input.udpEnabled ? 1 : 0,
        JSON.stringify(input.fingerprintSettings),
        new Date().toISOString(),
        input.id,
      )
    return this.getCloudPhoneById(input.id)!
  }

  deleteCloudPhone(id: string): void {
    this.db.prepare(`DELETE FROM cloud_phones WHERE id = ?`).run(id)
  }

  bulkDeleteCloudPhones(cloudPhoneIds: string[]): void {
    const stmt = this.db.prepare(`DELETE FROM cloud_phones WHERE id = ?`)
    const transaction = this.db.transaction((ids: string[]) => {
      for (const cloudPhoneId of ids) {
        stmt.run(cloudPhoneId)
      }
    })
    transaction(cloudPhoneIds)
  }

  bulkAssignCloudPhoneGroup(cloudPhoneIds: string[], groupName: string): void {
    const stmt = this.db.prepare(
      `UPDATE cloud_phones SET group_name = ?, updated_at = ? WHERE id = ?`,
    )
    const updatedAt = new Date().toISOString()
    const transaction = this.db.transaction((ids: string[]) => {
      for (const cloudPhoneId of ids) {
        stmt.run(groupName, updatedAt, cloudPhoneId)
      }
    })
    transaction(cloudPhoneIds)
  }

  setCloudPhoneStatus(id: string, status: CloudPhoneRecord['status']): void {
    const now = new Date().toISOString()
    this.db
      .prepare(`UPDATE cloud_phones SET status = ?, last_synced_at = ?, updated_at = ? WHERE id = ?`)
      .run(status, now, now, id)
  }

  setCloudPhoneProviderInstanceId(id: string, providerInstanceId: string | null): void {
    this.db
      .prepare(`UPDATE cloud_phones SET provider_instance_id = ?, updated_at = ? WHERE id = ?`)
      .run(providerInstanceId, new Date().toISOString(), id)
  }

  getProfileById(id: string): ProfileRecord | null {
    const row = this.db.prepare(`SELECT * FROM profiles WHERE id = ?`).get(id) as ProfileRow | undefined
    return row ? this.mapProfile(row) : null
  }

  createProfile(input: UpdateProfileInput): ProfileRecord {
    this.insertProfile(input)
    return this.getProfileById(input.id)!
  }

  updateProfile(input: UpdateProfileInput): ProfileRecord {
    const existing = this.getProfileById(input.id)
    if (!existing) {
      return this.createProfile(input)
    }

    this.db
      .prepare(
        `UPDATE profiles
         SET name = ?, proxy_id = ?, group_name = ?, tags = ?, notes = ?, fingerprint_config = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name,
        input.proxyId,
        input.groupName,
        JSON.stringify(input.tags),
        input.notes,
        JSON.stringify(input.fingerprintConfig),
        new Date().toISOString(),
        input.id,
      )
    return this.getProfileById(input.id)!
  }

  deleteProfile(id: string): void {
    this.db.prepare(`DELETE FROM profiles WHERE id = ?`).run(id)
  }

  bulkDeleteProfiles(profileIds: string[]): void {
    const stmt = this.db.prepare(`DELETE FROM profiles WHERE id = ?`)
    const transaction = this.db.transaction((ids: string[]) => {
      for (const profileId of ids) {
        stmt.run(profileId)
      }
    })
    transaction(profileIds)
  }

  bulkAssignGroup(profileIds: string[], groupName: string): void {
    const stmt = this.db.prepare(
      `UPDATE profiles SET group_name = ?, updated_at = ? WHERE id = ?`,
    )
    const updatedAt = new Date().toISOString()
    const transaction = this.db.transaction((ids: string[]) => {
      for (const profileId of ids) {
        stmt.run(groupName, updatedAt, profileId)
      }
    })
    transaction(profileIds)
  }

  cloneProfile(id: string): ProfileRecord {
    const existing = this.getProfileById(id)
    if (!existing) {
      throw new Error('Profile not found')
    }

    return this.createProfile({
      id: randomUUID(),
      name: cloneName(existing.name),
      proxyId: existing.proxyId,
      groupName: existing.groupName,
      tags: existing.tags,
      notes: existing.notes,
      fingerprintConfig: existing.fingerprintConfig,
    })
  }

  setProfileStatus(id: string, status: ProfileRecord['status']): void {
    this.db
      .prepare(`UPDATE profiles SET status = ?, updated_at = ? WHERE id = ?`)
      .run(status, new Date().toISOString(), id)
  }

  touchProfileLastStarted(id: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(`UPDATE profiles SET last_started_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, id)
  }

  listTemplates(): TemplateRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM templates ORDER BY datetime(created_at) DESC`)
      .all() as TemplateRow[]
    return rows.map((row) => this.mapTemplate(row))
  }

  getTemplateById(id: string): TemplateRecord | null {
    const row = this.db.prepare(`SELECT * FROM templates WHERE id = ?`).get(id) as TemplateRow | undefined
    return row ? this.mapTemplate(row) : null
  }

  createTemplate(input: UpdateTemplateInput): TemplateRecord {
    this.insertTemplate(input)
    return this.getTemplateById(input.id)!
  }

  updateTemplate(input: UpdateTemplateInput): TemplateRecord {
    const existing = this.getTemplateById(input.id)
    if (!existing) {
      return this.createTemplate(input)
    }

    this.db
      .prepare(
        `UPDATE templates
         SET name = ?, proxy_id = ?, group_name = ?, tags = ?, notes = ?, fingerprint_config = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name,
        input.proxyId,
        input.groupName,
        JSON.stringify(input.tags),
        input.notes,
        JSON.stringify(input.fingerprintConfig),
        new Date().toISOString(),
        input.id,
      )
    return this.getTemplateById(input.id)!
  }

  deleteTemplate(id: string): void {
    this.db.prepare(`DELETE FROM templates WHERE id = ?`).run(id)
  }

  createTemplateFromProfile(profileId: string): TemplateRecord {
    const profile = this.getProfileById(profileId)
    if (!profile) {
      throw new Error('Profile not found')
    }

    return this.createTemplate({
      id: randomUUID(),
      name: this.getUniqueName(profile.name, new Set(this.listTemplates().map((item) => item.name))),
      proxyId: profile.proxyId,
      groupName: profile.groupName,
      tags: profile.tags,
      notes: profile.notes,
      fingerprintConfig: profile.fingerprintConfig,
    })
  }

  listProxies(): ProxyRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM proxies ORDER BY datetime(created_at) DESC`)
      .all() as ProxyRow[]
    return rows.map((row) => this.mapProxy(row))
  }

  getProxyById(id: string): ProxyRecord | null {
    const row = this.db.prepare(`SELECT * FROM proxies WHERE id = ?`).get(id) as ProxyRow | undefined
    return row ? this.mapProxy(row) : null
  }

  createProxy(input: UpdateProxyInput): ProxyRecord {
    this.insertProxy(input)
    return this.getProxyById(input.id)!
  }

  updateProxy(input: UpdateProxyInput): ProxyRecord {
    const existing = this.getProxyById(input.id)
    if (!existing) {
      return this.createProxy(input)
    }

    this.db
      .prepare(
        `UPDATE proxies
         SET name = ?, type = ?, host = ?, port = ?, username = ?, password = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.name,
        input.type,
        input.host,
        input.port,
        input.username,
        input.password,
        new Date().toISOString(),
        input.id,
      )
    return this.getProxyById(input.id)!
  }

  deleteProxy(id: string): void {
    this.db.prepare(`UPDATE profiles SET proxy_id = NULL WHERE proxy_id = ?`).run(id)
    this.db.prepare(`UPDATE templates SET proxy_id = NULL WHERE proxy_id = ?`).run(id)
    this.db.prepare(`DELETE FROM proxies WHERE id = ?`).run(id)
  }

  setProxyStatus(id: string, status: ProxyRecord['status']): ProxyRecord {
    const checkedAt = new Date().toISOString()
    this.db
      .prepare(`UPDATE proxies SET status = ?, last_checked_at = ?, updated_at = ? WHERE id = ?`)
      .run(status, checkedAt, checkedAt, id)
    return this.getProxyById(id)!
  }

  listLogs(): LogEntry[] {
    const rows = this.db
      .prepare(`SELECT * FROM logs ORDER BY datetime(created_at) DESC LIMIT 500`)
      .all() as LogRow[]
    return rows.map((row) => this.mapLog(row))
  }

  clearLogs(): void {
    this.db.prepare(`DELETE FROM logs`).run()
  }

  createLog(input: {
    level: LogLevel
    category: LogEntry['category']
    message: string
    profileId: string | null
  }): void {
    this.db
      .prepare(
        `INSERT INTO logs (id, level, category, message, profile_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), input.level, input.category, input.message, input.profileId, new Date().toISOString())
  }

  getSettings(): SettingsPayload {
    const rows = this.db.prepare(`SELECT * FROM settings`).all() as { key: string; value: string }[]
    return rows.reduce<SettingsPayload>((acc, row) => {
      acc[row.key] = row.value
      return acc
    }, {})
  }

  setSettings(payload: SettingsPayload): SettingsPayload {
    const stmt = this.db.prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    const tx = this.db.transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) {
        stmt.run(key, value)
      }
    })
    tx(Object.entries(payload))
    return this.getSettings()
  }

  exportBundle(): ExportBundle {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      profiles: this.listProfiles(),
      proxies: this.listProxies(),
      templates: this.listTemplates(),
      cloudPhones: this.listCloudPhones(),
    }
  }

  exportRemoteConfigSnapshot(syncVersion = 0): RemoteConfigSnapshot {
    return {
      syncVersion,
      profiles: this.listProfiles(),
      proxies: this.listProxies(),
      templates: this.listTemplates(),
      cloudPhones: this.listCloudPhones(),
      settings: this.getSettings(),
    }
  }

  applyRemoteConfigSnapshot(snapshot: RemoteConfigSnapshot): void {
    const tx = this.db.transaction(() => {
      this.db.prepare(`DELETE FROM profiles`).run()
      this.db.prepare(`DELETE FROM templates`).run()
      this.db.prepare(`DELETE FROM proxies`).run()
      this.db.prepare(`DELETE FROM cloud_phones`).run()
      this.db.prepare(`DELETE FROM settings`).run()

      for (const proxy of snapshot.proxies || []) {
        this.insertProxy({
          id: proxy.id,
          name: proxy.name,
          type: proxy.type,
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
        })
        if (proxy.status === 'online' || proxy.status === 'offline' || proxy.status === 'unknown') {
          this.db
            .prepare(
              `UPDATE proxies SET status = ?, last_checked_at = ?, updated_at = ? WHERE id = ?`,
            )
            .run(proxy.status, proxy.lastCheckedAt, new Date().toISOString(), proxy.id)
        }
      }

      for (const profile of snapshot.profiles || []) {
        this.insertProfile(
          {
            id: profile.id,
            name: profile.name,
            proxyId: profile.proxyId,
            groupName: profile.groupName,
            tags: profile.tags,
            notes: profile.notes,
            fingerprintConfig: profile.fingerprintConfig,
          },
          profile.status || 'stopped',
        )
      }

      for (const template of snapshot.templates || []) {
        this.insertTemplate({
          id: template.id,
          name: template.name,
          proxyId: template.proxyId,
          groupName: template.groupName,
          tags: template.tags,
          notes: template.notes,
          fingerprintConfig: template.fingerprintConfig,
        })
      }

      for (const cloudPhone of snapshot.cloudPhones || []) {
        this.insertCloudPhone(
          {
            id: cloudPhone.id,
            name: cloudPhone.name,
            groupName: cloudPhone.groupName,
            tags: cloudPhone.tags,
            notes: cloudPhone.notes,
            platform: cloudPhone.platform,
            providerKey: cloudPhone.providerKey,
            providerKind: cloudPhone.providerKind,
            providerConfig: cloudPhone.providerConfig,
            providerInstanceId: cloudPhone.providerInstanceId,
            computeType: cloudPhone.computeType,
            ipLookupChannel: cloudPhone.ipLookupChannel,
            proxyType: cloudPhone.proxyType,
            ipProtocol: cloudPhone.ipProtocol,
            proxyHost: cloudPhone.proxyHost,
            proxyPort: cloudPhone.proxyPort,
            proxyUsername: cloudPhone.proxyUsername,
            proxyPassword: cloudPhone.proxyPassword,
            udpEnabled: cloudPhone.udpEnabled,
            fingerprintSettings: cloudPhone.fingerprintSettings,
          },
          cloudPhone.status || 'stopped',
        )
        this.db
          .prepare(
            `UPDATE cloud_phones
             SET last_synced_at = ?, created_at = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            cloudPhone.lastSyncedAt,
            cloudPhone.createdAt || new Date().toISOString(),
            cloudPhone.updatedAt || new Date().toISOString(),
            cloudPhone.id,
          )
      }

      const settingsStmt = this.db.prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      for (const [key, value] of Object.entries(snapshot.settings || {})) {
        settingsStmt.run(key, String(value))
      }
    })

    tx()
  }

  importBundle(bundle: ExportBundle): ImportResult {
    const warnings: string[] = []
    const existingProxyNames = new Set(this.listProxies().map((item) => item.name))
    const existingProfileNames = new Set(this.listProfiles().map((item) => item.name))
    const existingTemplateNames = new Set(this.listTemplates().map((item) => item.name))
    const existingCloudPhoneNames = new Set(this.listCloudPhones().map((item) => item.name))
    const existingProxyIds = new Set(this.listProxies().map((item) => item.id))
    const existingProfileIds = new Set(this.listProfiles().map((item) => item.id))
    const existingTemplateIds = new Set(this.listTemplates().map((item) => item.id))
    const existingCloudPhoneIds = new Set(this.listCloudPhones().map((item) => item.id))
    const importedProxyIdMap = new Map<string, string>()

    let proxiesImported = 0
    let profilesImported = 0
    let templatesImported = 0
    let cloudPhonesImported = 0

    const transaction = this.db.transaction(() => {
      for (const proxy of bundle.proxies ?? []) {
        const nextId = existingProxyIds.has(proxy.id) ? randomUUID() : proxy.id
        if (nextId !== proxy.id) {
          warnings.push(`代理 ID 冲突，已为 ${proxy.name} 生成新 ID`)
        }
        const nextName = this.getUniqueName(proxy.name, existingProxyNames)
        if (nextName !== proxy.name) {
          warnings.push(`代理名称冲突，已将 ${proxy.name} 重命名为 ${nextName}`)
        }
        this.insertProxy({
          id: nextId,
          name: nextName,
          type: proxy.type,
          host: proxy.host,
          port: proxy.port,
          username: proxy.username,
          password: proxy.password,
        })
        importedProxyIdMap.set(proxy.id, nextId)
        existingProxyIds.add(nextId)
        existingProxyNames.add(nextName)
        proxiesImported += 1
      }

      for (const profile of bundle.profiles ?? []) {
        const nextId = existingProfileIds.has(profile.id) ? randomUUID() : profile.id
        if (nextId !== profile.id) {
          warnings.push(`环境 ID 冲突，已为 ${profile.name} 生成新 ID`)
        }
        const nextName = this.getUniqueName(profile.name, existingProfileNames)
        if (nextName !== profile.name) {
          warnings.push(`环境名称冲突，已将 ${profile.name} 重命名为 ${nextName}`)
        }
        let proxyId = profile.proxyId ? importedProxyIdMap.get(profile.proxyId) ?? profile.proxyId : null
        if (proxyId && !this.getProxyById(proxyId)) {
          warnings.push(`环境 ${nextName} 关联的代理缺失，已清空代理绑定`)
          proxyId = null
        }
        this.insertProfile(
          {
            id: nextId,
            name: nextName,
            proxyId,
            groupName: profile.groupName,
            tags: profile.tags,
            notes: profile.notes,
            fingerprintConfig: profile.fingerprintConfig,
          },
          profile.status ?? 'stopped',
        )
        existingProfileIds.add(nextId)
        existingProfileNames.add(nextName)
        profilesImported += 1
      }

      for (const template of bundle.templates ?? []) {
        const nextId = existingTemplateIds.has(template.id) ? randomUUID() : template.id
        if (nextId !== template.id) {
          warnings.push(`模板 ID 冲突，已为 ${template.name} 生成新 ID`)
        }
        const nextName = this.getUniqueName(template.name, existingTemplateNames)
        if (nextName !== template.name) {
          warnings.push(`模板名称冲突，已将 ${template.name} 重命名为 ${nextName}`)
        }
        let proxyId = template.proxyId ? importedProxyIdMap.get(template.proxyId) ?? template.proxyId : null
        if (proxyId && !this.getProxyById(proxyId)) {
          warnings.push(`模板 ${nextName} 关联的代理缺失，已清空代理绑定`)
          proxyId = null
        }
        this.insertTemplate({
          id: nextId,
          name: nextName,
          proxyId,
          groupName: template.groupName,
          tags: template.tags,
          notes: template.notes,
          fingerprintConfig: template.fingerprintConfig,
        })
        existingTemplateIds.add(nextId)
        existingTemplateNames.add(nextName)
        templatesImported += 1
      }

      for (const cloudPhone of bundle.cloudPhones ?? []) {
        const nextId = existingCloudPhoneIds.has(cloudPhone.id) ? randomUUID() : cloudPhone.id
        if (nextId !== cloudPhone.id) {
          warnings.push(`云手机环境 ID 冲突，已为 ${cloudPhone.name} 生成新 ID`)
        }
        const nextName = this.getUniqueName(cloudPhone.name, existingCloudPhoneNames)
        if (nextName !== cloudPhone.name) {
          warnings.push(`云手机环境名称冲突，已将 ${cloudPhone.name} 重命名为 ${nextName}`)
        }
        this.insertCloudPhone(
          {
            id: nextId,
            name: nextName,
            groupName: cloudPhone.groupName,
            tags: cloudPhone.tags,
            notes: cloudPhone.notes,
            platform: 'android',
            providerKey: cloudPhone.providerKey,
            providerKind: cloudPhone.providerKind ?? 'mock',
            providerConfig: cloudPhone.providerConfig ?? {},
            providerInstanceId: cloudPhone.providerInstanceId,
            computeType: cloudPhone.computeType,
            ipLookupChannel: cloudPhone.ipLookupChannel,
            proxyType: cloudPhone.proxyType,
            ipProtocol: cloudPhone.ipProtocol,
            proxyHost: cloudPhone.proxyHost,
            proxyPort: cloudPhone.proxyPort,
            proxyUsername: cloudPhone.proxyUsername,
            proxyPassword: cloudPhone.proxyPassword,
            udpEnabled: cloudPhone.udpEnabled,
            fingerprintSettings: cloudPhone.fingerprintSettings,
          },
          cloudPhone.status ?? 'provisioned',
        )
        existingCloudPhoneIds.add(nextId)
        existingCloudPhoneNames.add(nextName)
        cloudPhonesImported += 1
      }
    })

    transaction()
    return { profilesImported, proxiesImported, templatesImported, cloudPhonesImported, warnings }
  }

  getDashboardSummary(): DashboardSummary {
    const totalProfiles = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM profiles`).get() as CountRow).count)
    const runningProfiles = Number(
      (this.db.prepare(`SELECT COUNT(*) AS count FROM profiles WHERE status = 'running'`).get() as CountRow).count,
    )
    const totalProxies = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM proxies`).get() as CountRow).count)
    const onlineProxies = Number(
      (this.db.prepare(`SELECT COUNT(*) AS count FROM proxies WHERE status = 'online'`).get() as CountRow).count,
    )
    const totalCloudPhones = Number(
      (this.db.prepare(`SELECT COUNT(*) AS count FROM cloud_phones`).get() as CountRow).count,
    )
    const runningCloudPhones = Number(
      (this.db.prepare(`SELECT COUNT(*) AS count FROM cloud_phones WHERE status = 'running'`).get() as CountRow)
        .count,
    )
    const cloudPhoneErrors = Number(
      (this.db.prepare(`SELECT COUNT(*) AS count FROM cloud_phones WHERE status = 'error'`).get() as CountRow)
        .count,
    )
    const logCount = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM logs`).get() as CountRow).count)

    return {
      totalProfiles,
      runningProfiles,
      totalProxies,
      onlineProxies,
      totalCloudPhones,
      runningCloudPhones,
      cloudPhoneErrors,
      logCount,
    }
  }
}
