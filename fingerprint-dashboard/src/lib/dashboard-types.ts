import type {
  HostEnvironment,
  ProxyProtocol,
  ProxyVerificationRecord,
} from '@/lib/proxyTypes';

export type PlatformKind = 'tiktok' | 'linkedin' | 'facebook' | '';
export type RuntimeMode = 'local' | 'strong-local' | 'vm' | 'container';
export type ProxyBindingMode = 'dedicated' | 'reusable';
export type IpUsageMode = 'dedicated' | 'shared';
export type ProxySharingMode = 'dedicated' | 'shared' | 'hybrid';

export type WorkspaceAllowedOverrideKey =
  | 'timezone'
  | 'browserLanguage'
  | 'resolution'
  | 'downloadsDirAlias'
  | 'nonCriticalLaunchArgs';

export type WorkspaceBlockedOverrideKey =
  | 'browserFamily'
  | 'profileDir'
  | 'extensionsDirRoot'
  | 'webrtcHardPolicy'
  | 'ipv6HardPolicy'
  | 'browserMajorVersionRange';
export type WorkspaceMigrationState =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'failed_retriable'
  | 'failed_manual';
export type WorkspaceMigrationCheckpointName =
  | 'legacy_profile_detected'
  | 'workspace_meta_initialized'
  | 'directory_layout_prepared'
  | 'path_mapping_persisted'
  | 'template_binding_resolved'
  | 'consistency_baseline_written'
  | 'migration_completed';

export interface WorkspaceMigrationCheckpoint {
  name: WorkspaceMigrationCheckpointName;
  completedAt: string;
}

export interface WorkspaceTemplateBinding {
  templateId: string;
  templateRevision: string;
  templateFingerprintHash: string;
}

export interface WorkspacePaths {
  profileDir: string;
  cacheDir: string;
  downloadsDir: string;
  extensionsDir: string;
  metaDir: string;
}

export interface WorkspaceEnvironment {
  browserFamily: string;
  browserMajorVersionRange: string;
  systemLanguage: string;
  browserLanguage: string;
  timezone: string;
  resolution: string;
  fontStrategy: string;
  webrtcPolicy: string;
  ipv6Policy: string;
  downloadsDir: string;
  launchArgs: string[];
}

export interface WorkspaceHealthReport {
  status: 'unknown' | 'healthy' | 'warning' | 'broken';
  messages: string[];
  checkedAt: string;
}

export interface WorkspaceConsistencyReport {
  status: 'unknown' | 'pass' | 'warn' | 'block';
  messages: string[];
  checkedAt: string;
  templateFingerprintHash: string;
  templateRevision: string;
}

export interface WorkspaceSnapshotSummary {
  lastSnapshotId: string;
  lastSnapshotAt: string;
  lastKnownGoodSnapshotId: string;
  lastKnownGoodSnapshotAt: string;
  lastKnownGoodStatus: 'unknown' | 'valid' | 'invalid';
  lastKnownGoodInvalidatedAt: string;
  lastKnownGoodInvalidationReason: string;
}

export interface WorkspaceDescriptor {
  identityProfileId: string;
  version: number;
  migrationState: WorkspaceMigrationState;
  migrationCheckpoints: WorkspaceMigrationCheckpoint[];
  templateBinding: WorkspaceTemplateBinding;
  allowedOverrides: WorkspaceAllowedOverrideKey[];
  blockedOverrides: WorkspaceBlockedOverrideKey[];
  declaredOverrides: Partial<Record<WorkspaceAllowedOverrideKey, string | string[]>>;
  resolvedEnvironment: WorkspaceEnvironment;
  paths: WorkspacePaths;
  healthSummary: WorkspaceHealthReport;
  consistencySummary: WorkspaceConsistencyReport;
  snapshotSummary: WorkspaceSnapshotSummary;
  recovery: {
    lastRecoveryAt: string;
    lastRecoveryReason: string;
  };
}

export interface WorkspaceSnapshotStorageStateMetadata {
  version: number;
  stateHash: string;
  updatedAt: string;
  deviceId: string;
  source: string;
  fileRef?: string;
  checksum?: string;
  size?: number;
  contentType?: string;
  stateJson?: BrowserStorageState | null;
}

export interface BrowserStorageState {
  cookies?: Array<Record<string, unknown>>;
  origins?: Array<{
    origin: string;
    localStorage?: Array<{ name: string; value: string }>;
  }>;
}

export interface WorkspaceSnapshotDirectoryEntry {
  key: keyof WorkspacePaths;
  path: string;
  exists: boolean;
  entryCount: number;
  fileCount: number;
  directoryCount: number;
  totalBytes: number;
  latestModifiedAt: string;
}

export interface WorkspaceSnapshotRecord {
  snapshotId: string;
  profileId: string;
  templateRevision: string;
  templateFingerprintHash: string;
  manifest: Record<string, unknown>;
  workspaceManifestRef?: string;
  storageStateRef?: string;
  workspaceMetadata: WorkspaceDescriptor;
  storageState: WorkspaceSnapshotStorageStateMetadata;
  directoryManifest: WorkspaceSnapshotDirectoryEntry[];
  healthSummary: WorkspaceHealthReport;
  consistencySummary: WorkspaceConsistencyReport;
  validatedStartAt?: string;
  fileRef?: string;
  checksum?: string;
  size?: number;
  contentType?: string;
  retentionPolicy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  name: string;
  platform?: PlatformKind;
  purpose?: 'register' | 'nurture' | 'operation';
  runtimeMode?: RuntimeMode;
  proxyBindingMode?: ProxyBindingMode;
  ipUsageMode?: IpUsageMode;
  lifecycleState?: string;
  riskFlags?: string[];
  cooldownSummary?: {
    active: boolean;
    reason: string;
    until: string;
  };
  fingerprintPresetRef?: string;
  workspaceManifestRef?: string;
  ownerLabel?: string;
  status: string;
  lastActive: string;
  lastLaunchAt?: string;
  lastSuccessAt?: string;
  lastRestoreAt?: string;
  tags: string[];
  proxy?: string;
  proxyType?: ProxyProtocol;
  proxyHost?: string;
  proxyPort?: string;
  proxyUsername?: string;
  proxyPassword?: string;
  proxyTypeSource?: 'explicit' | 'inferred' | 'direct';
  expectedProxyIp?: string;
  preferredProxyTransport?: ProxyProtocol;
  lastResolvedProxyTransport?: ProxyProtocol;
  lastHostEnvironment?: HostEnvironment;
  expectedProxyCountry?: string;
  expectedProxyRegion?: string;
  ua?: string;
  seed?: string;
  isMobile?: boolean;
  groupId?: string;
  runtimeSessionId?: string;
  proxyVerification?: ProxyVerificationRecord;
  startupPlatform?: string;
  startupUrl?: string;
  startupNavigation?: {
    ok: boolean;
    requestedUrl?: string;
    finalUrl?: string;
    error?: string;
  };
  workspace?: WorkspaceDescriptor | null;
  proxyAssetId?: string;
  activeLeaseId?: string;
  lastLaunchBlock?: {
    code: string;
    message: string;
    detail?: unknown;
    blockedAt?: string;
  } | null;
  proxyAssetSummary?: {
    id: string;
    sharingMode: ProxySharingMode;
    maxProfilesPerIp: number;
    maxConcurrentRunsPerIp: number;
    boundProfilesCount: number;
    activeLeasesCount: number;
    runningProfilesCount: number;
    affectedProfileIds: string[];
  } | null;
  activeLeaseSummary?: {
    id: string;
    state: string;
    assignedAt?: string | null;
    releasedAt?: string | null;
    deviceId?: string;
    ipUsageMode?: IpUsageMode;
  } | null;
  ipUsagePolicy?: {
    allowedIpUsageModes: IpUsageMode[];
    defaultIpUsageMode: IpUsageMode;
    sharedIpMaxProfilesPerIp: number;
    sharedIpMaxConcurrentRunsPerIp: number;
  } | null;
}

export interface ProxyAssetSummary {
  id: string;
  name: string;
  sharingMode: ProxySharingMode;
  maxProfilesPerIp: number;
  maxConcurrentRunsPerIp: number;
  boundProfilesCount: number;
  activeLeasesCount: number;
  runningProfilesCount: number;
  affectedProfileIds: string[];
}

export interface IpLeaseSummary {
  id: string;
  leaseId?: string;
  profileId: string;
  proxyAssetId: string;
  platform: string;
  purpose: string;
  ipUsageMode: IpUsageMode;
  state: string;
  deviceId: string;
  assignedAt?: string | null;
  releasedAt?: string | null;
}

export interface PlatformPolicySummary {
  policyId: string;
  platform: string;
  purpose: string;
  proxyPolicy: {
    allowedIpUsageModes: IpUsageMode[];
    defaultIpUsageMode: IpUsageMode;
    sharedIpMaxProfilesPerIp: number;
    sharedIpMaxConcurrentRunsPerIp: number;
  };
}

export type BehaviorAction = {
  type: string;
  url?: string;
  selector?: string;
  [key: string]: unknown;
};

export interface Behavior {
  id: string;
  name: string;
  description?: string;
  enabled?: boolean;
  actions: BehaviorAction[];
}

export type GroupItem = {
  id: string;
  name: string;
  color?: string;
  notes?: string;
};

export type ProxyListItem = {
  id: string;
  host: string;
  port: string;
  type: 'HTTP' | 'SOCKS5';
  status: string;
  delay: string;
  city: string;
};

export interface Settings {
  runtimeUrl: string;
  runtimeApiKey: string;
  autoFingerprint: boolean;
  autoProxyVerification: boolean;
  defaultStartupPlatform: string;
  defaultStartupUrl: string;
  theme: string;
}

export type DashboardTab =
  | '控制台'
  | '浏览器环境'
  | '手机环境'
  | '自动化流程'
  | '团队分组'
  | '代理 IP'
  | '扩展程序'
  | '系统设置';

export type CurrentUserSummary = {
  email?: string;
  username?: string;
  name?: string;
  role?: string;
} | null;
