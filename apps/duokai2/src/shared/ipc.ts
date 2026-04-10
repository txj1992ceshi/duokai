import type {
  CloudPhoneBulkActionPayload,
  CloudPhoneDetails,
  CloudPhoneProviderHealth,
  CloudPhoneProviderSummary,
  CloudPhoneProxyTestResult,
  CloudPhoneRecord,
  CreateCloudPhoneInput,
  CreateProfileInput,
  CreateProxyInput,
  CreateTemplateInput,
  DashboardSummary,
  DesktopAuthState,
  DesktopRuntimeInfo,
  DesktopWindowFrameMetrics,
  DesktopUpdateState,
  DetectedLocalEmulator,
  ExportBundle,
  ImportResult,
  LogEntry,
  ProfileDirectoryInfo,
  ProfileBulkActionPayload,
  ProfileRecord,
  ProxyRecord,
  ProxyTestResult,
  RuntimeStatus,
  RuntimeHostInfo,
  SettingsPayload,
  TemplateRecord,
  UpdateCloudPhoneInput,
  UpdateProfileInput,
  UpdateProxyInput,
  UpdateTemplateInput,
  WorkspaceSnapshotRecord,
} from './types'

export interface DesktopApi {
  auth: {
    getState: () => Promise<DesktopAuthState>
    login: (payload: {
      identifier: string
      password: string
      apiBase?: string
      rememberCredentials?: boolean
    }) => Promise<DesktopAuthState>
    updateProfile: (payload: {
      name: string
      email: string
      username: string
      avatarUrl: string
      bio: string
    }) => Promise<DesktopAuthState>
    uploadAvatar: () => Promise<DesktopAuthState>
    changePassword: (payload: {
      currentPassword: string
      nextPassword: string
    }) => Promise<{ success: boolean }>
    revokeDevice: (deviceId: string) => Promise<DesktopAuthState>
    deleteDevice: (deviceId: string) => Promise<DesktopAuthState>
    logout: () => Promise<DesktopAuthState>
    syncProfiles: () => Promise<{ count: number }>
  }
  meta: {
    getInfo: () => Promise<DesktopRuntimeInfo>
    getAgentState: () => Promise<{
      enabled: boolean
      writable: boolean
      connected: boolean
      agentId: string
      protocolVersion: '1'
      lastHeartbeatAt: string | null
      lastError: string
      consecutiveFailures: number
      lastTaskId: string | null
      lastTaskStatus: 'RECEIVED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | null
      lastTaskFinishedAt: string | null
    }>
    onConfigChanged: (listener: () => void) => () => void
    onWindowFrameChanged: (listener: (metrics: DesktopWindowFrameMetrics) => void) => () => void
  }
  updater: {
    getState: () => Promise<DesktopUpdateState>
    check: () => Promise<DesktopUpdateState>
    download: () => Promise<DesktopUpdateState>
    install: () => Promise<{ success: boolean; message: string }>
    openReleasePage: () => Promise<void>
    onStateChange: (listener: (state: DesktopUpdateState) => void) => () => void
  }
  dashboard: {
    summary: () => Promise<DashboardSummary>
  }
  cloudPhones: {
    list: () => Promise<CloudPhoneRecord[]>
    listProviders: () => Promise<CloudPhoneProviderSummary[]>
    getProviderHealth: () => Promise<CloudPhoneProviderHealth[]>
    detectLocalDevices: () => Promise<DetectedLocalEmulator[]>
    create: (input: CreateCloudPhoneInput) => Promise<CloudPhoneRecord>
    update: (input: UpdateCloudPhoneInput) => Promise<CloudPhoneRecord>
    delete: (id: string) => Promise<void>
    start: (id: string) => Promise<void>
    stop: (id: string) => Promise<void>
    getStatus: (id: string) => Promise<CloudPhoneRecord['status']>
    getDetails: (id: string) => Promise<CloudPhoneDetails>
    testProxy: (input: CreateCloudPhoneInput) => Promise<CloudPhoneProxyTestResult>
    refreshStatuses: () => Promise<CloudPhoneRecord[]>
    bulkStart: (payload: CloudPhoneBulkActionPayload) => Promise<void>
    bulkStop: (payload: CloudPhoneBulkActionPayload) => Promise<void>
    bulkDelete: (payload: CloudPhoneBulkActionPayload) => Promise<void>
    bulkAssignGroup: (payload: CloudPhoneBulkActionPayload) => Promise<void>
  }
  profiles: {
    list: () => Promise<ProfileRecord[]>
    create: (input: CreateProfileInput) => Promise<ProfileRecord>
    update: (input: UpdateProfileInput) => Promise<ProfileRecord>
    delete: (id: string) => Promise<void>
    clone: (id: string) => Promise<ProfileRecord>
    revealDirectory: (id: string) => Promise<void>
    getDirectoryInfo: () => Promise<ProfileDirectoryInfo>
    bulkStart: (payload: ProfileBulkActionPayload) => Promise<void>
    bulkStop: (payload: ProfileBulkActionPayload) => Promise<void>
    bulkDelete: (payload: ProfileBulkActionPayload) => Promise<void>
    bulkAssignGroup: (payload: ProfileBulkActionPayload) => Promise<void>
  }
  templates: {
    list: () => Promise<TemplateRecord[]>
    create: (input: CreateTemplateInput) => Promise<TemplateRecord>
    update: (input: UpdateTemplateInput) => Promise<TemplateRecord>
    delete: (id: string) => Promise<void>
    createFromProfile: (profileId: string) => Promise<TemplateRecord>
  }
  proxies: {
    list: () => Promise<ProxyRecord[]>
    create: (input: CreateProxyInput) => Promise<ProxyRecord>
    update: (input: UpdateProxyInput) => Promise<ProxyRecord>
    delete: (id: string) => Promise<void>
    test: (id: string) => Promise<ProxyTestResult>
  }
  runtime: {
    launch: (profileId: string) => Promise<void>
    stop: (profileId: string) => Promise<void>
    getStatus: () => Promise<RuntimeStatus>
    getHostInfo: () => Promise<RuntimeHostInfo>
  }
  workspace: {
    snapshots: {
      list: (profileId: string) => Promise<WorkspaceSnapshotRecord[]>
      create: (profileId: string) => Promise<WorkspaceSnapshotRecord>
      restore: (profileId: string, snapshotId: string) => Promise<ProfileRecord>
      rollback: (profileId: string) => Promise<ProfileRecord>
    }
  }
  logs: {
    list: () => Promise<LogEntry[]>
    clear: () => Promise<void>
  }
  settings: {
    get: () => Promise<SettingsPayload>
    set: (payload: SettingsPayload) => Promise<SettingsPayload>
  }
  data: {
    exportBundle: () => Promise<string | null>
    importBundle: () => Promise<ImportResult | null>
    previewBundle: () => Promise<ExportBundle>
  }
}
