import type { LocaleCode } from '../i18n'
import type { DesktopUpdateState, ProfileRecord } from '../shared/types'

type PendingLaunchState = Record<string, number>

export type EnvironmentSyncSummary = {
  label: string
  detail: string
  className: string
} | null

export type RuntimeArtifactSyncSummary = {
  key: 'storageState' | 'workspaceSummary' | 'workspaceSnapshot'
  label: string
  detail: string
  className: string
}

const PROFILE_LAUNCH_PHASE_LABELS: Record<
  LocaleCode,
  Record<'full-check' | 'quick-check' | 'browser-launch' | 'default', string>
> = {
  'zh-CN': {
    'full-check': '完整校验中',
    'quick-check': '快速隔离校验中',
    'browser-launch': '隔离环境启动中',
    default: '启动中',
  },
  'en-US': {
    'full-check': 'Full check',
    'quick-check': 'Quick isolation check',
    'browser-launch': 'Launching isolated environment',
    default: 'Starting',
  },
}

const ENVIRONMENT_SYNC_COPY: Record<
  LocaleCode,
  {
    syncedAt: string
    recovery: string
    recoveryDetail: string
    conflict: string
    conflictDetail: string
    error: string
    pending: string
    pendingDetail: string
    syncing: string
    syncingDetail: string
    synced: string
    idle: string
    idleDetail: string
  }
> = {
  'zh-CN': {
    syncedAt: '最近同步',
    recovery: '环境待恢复',
    recoveryDetail: '检测到上次未完成同步，请选择上传当前环境或从云端拉取',
    conflict: '环境同步冲突',
    conflictDetail: '云端共享环境配置已更新，请选择上传本地改动或从云端拉取',
    error: '环境同步失败',
    pending: '环境待同步',
    pendingDetail: '本地共享环境配置有改动尚未上传到云端',
    syncing: '环境同步中',
    syncingDetail: '正在同步共享环境配置到云端',
    synced: '环境已同步',
    idle: '环境未同步',
    idleDetail: '当前环境尚未执行过共享环境配置同步',
  },
  'en-US': {
    syncedAt: 'Last sync',
    recovery: 'Environment recovery',
    recoveryDetail: 'The previous sync was interrupted. Upload this environment or pull from cloud.',
    conflict: 'Environment conflict',
    conflictDetail: 'Shared cloud environment data changed. Upload local changes or pull from cloud.',
    error: 'Environment sync failed',
    pending: 'Environment pending',
    pendingDetail: 'Local shared environment changes are waiting to be uploaded',
    syncing: 'Environment syncing',
    syncingDetail: 'Syncing shared environment config',
    synced: 'Environment synced',
    idle: 'Environment not synced',
    idleDetail: 'No shared environment config sync has been completed for this environment yet',
  },
}

const RUNTIME_SYNC_COPY: Record<
  LocaleCode,
  Record<'storageState' | 'workspaceSummary' | 'workspaceSnapshot', string>
> = {
  'zh-CN': {
    storageState: '登录态',
    workspaceSummary: '环境摘要',
    workspaceSnapshot: '环境快照',
  },
  'en-US': {
    storageState: 'Storage state',
    workspaceSummary: 'Workspace summary',
    workspaceSnapshot: 'Workspace snapshot',
  },
}

const UPDATE_STATUS_COPY: Record<
  LocaleCode,
  {
    loading: string
    unsupported: string
    checking: string
    available: (latestVersion: string, assetName?: string | null, isPrereleaseCandidate?: boolean) => string
    latest: string
    downloading: (progressPercent?: number | null) => string
    downloadedWindows: string
    downloadedOther: string
    error: string
    ready: string
    actionCheck: string
    actionDownload: string
    actionDownloading: string
    actionInstallWindows: string
    actionInstallOther: string
    actionOpenRelease: string
  }
> = {
  'zh-CN': {
    loading: '正在读取更新状态…',
    unsupported: '当前是开发环境，自动更新只在正式打包后的桌面端启用。',
    checking: '正在检查最新版本…',
    available: (latestVersion, assetName, isPrereleaseCandidate) =>
      `发现${isPrereleaseCandidate ? '测试版' : '新'}版本 ${latestVersion}${assetName ? `，可下载 ${assetName}` : ''}。`,
    latest: '当前已是最新版本。',
    downloading: (progressPercent) => `正在下载更新 ${progressPercent ? `${progressPercent}%` : ''}`.trim(),
    downloadedWindows: '更新已下载完成，点击下方按钮重启并安装。',
    downloadedOther: '更新已下载完成，点击下方按钮重启并安装。',
    error: '更新检查失败。',
    ready: '自动更新已就绪，可随时检查。',
    actionCheck: '检查更新',
    actionDownload: '下载更新',
    actionDownloading: '下载中…',
    actionInstallWindows: '重启并安装',
    actionInstallOther: '重启并安装',
    actionOpenRelease: '打开发布页',
  },
  'en-US': {
    loading: 'Loading update status...',
    unsupported: 'Auto update is only enabled in packaged desktop builds.',
    checking: 'Checking for the latest version...',
    available: (latestVersion, assetName, isPrereleaseCandidate) =>
      `${isPrereleaseCandidate ? 'Prerelease' : 'Update'} ${latestVersion} is available${assetName ? ` as ${assetName}` : ''}.`,
    latest: 'You already have the latest version.',
    downloading: (progressPercent) => `Downloading update ${progressPercent ? `${progressPercent}%` : ''}`.trim(),
    downloadedWindows: 'The update is ready. Use the button below to restart and install it.',
    downloadedOther: 'The update is ready. Use the button below to restart and install it.',
    error: 'Update check failed.',
    ready: 'Auto update is ready. You can check at any time.',
    actionCheck: 'Check for updates',
    actionDownload: 'Download update',
    actionDownloading: 'Downloading...',
    actionInstallWindows: 'Restart and install',
    actionInstallOther: 'Restart and install',
    actionOpenRelease: 'Open release page',
  },
}

export function resolveProfileVisualState(
  profile: ProfileRecord,
  {
    pendingProfileLaunches,
    runtimeQueuedIds,
    runtimeStartingIds,
  }: {
    pendingProfileLaunches: PendingLaunchState
    runtimeQueuedIds: Set<string>
    runtimeStartingIds: Set<string>
  },
): ProfileRecord['status'] {
  if (
    pendingProfileLaunches[profile.id] ||
    runtimeQueuedIds.has(profile.id) ||
    runtimeStartingIds.has(profile.id)
  ) {
    return 'starting'
  }
  return profile.status
}

export function getDesktopProfileLaunchPhaseLabel(
  profile: ProfileRecord,
  runtimeLaunchStages: Record<
    string,
    ProfileRecord['fingerprintConfig']['runtimeMetadata']['launchValidationStage']
  >,
  locale: LocaleCode,
): string {
  const stage =
    runtimeLaunchStages[profile.id] ||
    profile.fingerprintConfig.runtimeMetadata.launchValidationStage
  const labels = PROFILE_LAUNCH_PHASE_LABELS[locale]
  if (stage === 'full-check' || stage === 'quick-check' || stage === 'browser-launch') {
    return labels[stage]
  }
  return labels.default
}

export function formatLocalizedDate(
  value: string | null,
  locale: LocaleCode,
  emptyLabel: string,
): string {
  if (!value) {
    return emptyLabel
  }
  return new Date(value).toLocaleString(locale)
}

export function getDesktopEnvironmentSyncSummary(
  profile: ProfileRecord,
  locale: LocaleCode,
  emptyDateLabel: string,
): EnvironmentSyncSummary {
  const copy = ENVIRONMENT_SYNC_COPY[locale]
  const metadata = profile.fingerprintConfig.runtimeMetadata
  const syncedAt = metadata.lastEnvironmentSyncAt
  const baseDetail = syncedAt
    ? `${copy.syncedAt} ${formatLocalizedDate(syncedAt, locale, emptyDateLabel)}`
    : ''

  if (metadata.lastEnvironmentSyncStatus === 'conflict') {
    return {
      label: copy.conflict,
      detail: metadata.lastEnvironmentSyncMessage || copy.conflictDetail,
      className: 'conflict',
    }
  }
  if (metadata.lastEnvironmentSyncStatus === 'recovery') {
    return {
      label: copy.recovery,
      detail: metadata.lastEnvironmentSyncMessage || copy.recoveryDetail,
      className: 'pending',
    }
  }
  if (metadata.lastEnvironmentSyncStatus === 'error') {
    return {
      label: copy.error,
      detail: metadata.lastEnvironmentSyncMessage || baseDetail,
      className: 'error',
    }
  }
  if (metadata.lastEnvironmentSyncStatus === 'syncing') {
    return {
      label: copy.syncing,
      detail: metadata.lastEnvironmentSyncMessage || baseDetail || copy.syncingDetail,
      className: 'syncing',
    }
  }
  if (metadata.lastEnvironmentSyncStatus === 'pending') {
    return {
      label: copy.pending,
      detail: metadata.lastEnvironmentSyncMessage || baseDetail || copy.pendingDetail,
      className: 'pending',
    }
  }
  if (metadata.lastEnvironmentSyncStatus === 'synced' || syncedAt) {
    return {
      label: copy.synced,
      detail: baseDetail || metadata.lastEnvironmentSyncMessage,
      className: 'synced',
    }
  }
  return {
    label: copy.idle,
    detail: metadata.lastEnvironmentSyncMessage || copy.idleDetail,
    className: 'idle',
  }
}

export function getDesktopRuntimeArtifactSyncSummaries(
  profile: ProfileRecord,
  locale: LocaleCode,
  emptyDateLabel: string,
): RuntimeArtifactSyncSummary[] {
  const metadata = profile.fingerprintConfig.runtimeMetadata
  const labels = RUNTIME_SYNC_COPY[locale]
  const entries: RuntimeArtifactSyncSummary[] = []
  const pushSummary = (
    key: RuntimeArtifactSyncSummary['key'],
    status: 'idle' | 'synced' | 'syncing' | 'error' | 'pending' | 'conflict',
    message: string,
    at: string,
  ) => {
    if (status === 'idle' && !message && !at) {
      return
    }
    entries.push({
      key,
      label: labels[key],
      detail: message || (at ? formatLocalizedDate(at, locale, emptyDateLabel) : emptyDateLabel),
      className:
        status === 'error'
          ? 'error'
          : status === 'syncing'
            ? 'syncing'
            : status === 'pending'
              ? 'pending'
              : status === 'conflict'
                ? 'conflict'
                : status === 'synced'
                  ? 'synced'
                  : 'idle',
    })
  }

  pushSummary(
    'storageState',
    metadata.lastStorageStateSyncStatus,
    metadata.lastStorageStateSyncMessage,
    metadata.lastStorageStateSyncedAt,
  )
  pushSummary(
    'workspaceSummary',
    metadata.lastWorkspaceSummarySyncStatus,
    metadata.lastWorkspaceSummarySyncMessage,
    metadata.lastWorkspaceSummarySyncAt,
  )
  pushSummary(
    'workspaceSnapshot',
    metadata.lastWorkspaceSnapshotSyncStatus,
    metadata.lastWorkspaceSnapshotSyncMessage,
    metadata.lastWorkspaceSnapshotSyncAt,
  )
  return entries
}

export function describeDesktopUpdateStatus(
  state: DesktopUpdateState | null,
  locale: LocaleCode,
  rendererOperatingSystem: string,
): string {
  const copy = UPDATE_STATUS_COPY[locale]
  if (!state) {
    return copy.loading
  }
  switch (state.status) {
    case 'unsupported':
      return copy.unsupported
    case 'checking':
      return copy.checking
    case 'available':
      return copy.available(state.latestVersion || '', state.assetName, state.isPrereleaseCandidate)
    case 'not-available':
      return copy.latest
    case 'downloading':
      return copy.downloading(state.progressPercent)
    case 'downloaded':
      return rendererOperatingSystem === 'Windows'
        ? copy.downloadedWindows
        : copy.downloadedOther
    case 'error':
      return state.message || copy.error
    default:
      return copy.ready
  }
}

export function getDesktopUpdateActionLabel(
  state: DesktopUpdateState | null,
  locale: LocaleCode,
  rendererOperatingSystem: string,
): string {
  const copy = UPDATE_STATUS_COPY[locale]
  if (!state) {
    return copy.actionCheck
  }
  if (state.status === 'available') {
    return copy.actionDownload
  }
  if (state.status === 'downloading') {
    return copy.actionDownloading
  }
  if (state.status === 'downloaded') {
    return rendererOperatingSystem === 'Windows'
      ? copy.actionInstallWindows
      : copy.actionInstallOther
  }
  if (state.status === 'error' && state.fallbackToManual) {
    return copy.actionOpenRelease
  }
  return copy.actionCheck
}
