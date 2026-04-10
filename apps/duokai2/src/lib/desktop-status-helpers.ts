import type { LocaleCode } from '../i18n'
import type { DesktopUpdateState, ProfileRecord } from '../shared/types'

type PendingLaunchState = Record<string, number>

export type StorageSyncSummary = {
  label: string
  detail: string
  className: string
} | null

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

const STORAGE_SYNC_COPY: Record<
  LocaleCode,
  {
    version: string
    conflict: string
    conflictDetail: string
    error: string
    pending: string
    pendingDetail: string
    synced: string
    idle: string
    idleDetail: string
  }
> = {
  'zh-CN': {
    version: '版本',
    conflict: '登录态冲突',
    conflictDetail: '云端登录态已更新，请重新启动环境同步最新状态',
    error: '登录态同步失败',
    pending: '登录态同步中',
    pendingDetail: '正在上传云端登录态',
    synced: '登录态已同步',
    idle: '登录态未同步',
    idleDetail: '当前环境还没有云端登录态版本',
  },
  'en-US': {
    version: 'Version',
    conflict: 'Storage conflict',
    conflictDetail: 'Cloud storage state changed. Restart the profile to sync the latest state.',
    error: 'Storage sync failed',
    pending: 'Storage syncing',
    pendingDetail: 'Uploading storage state',
    synced: 'Storage synced',
    idle: 'Storage not synced',
    idleDetail: 'No cloud storage state version yet',
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

export function getDesktopStorageSyncSummary(
  profile: ProfileRecord,
  locale: LocaleCode,
  emptyDateLabel: string,
): StorageSyncSummary {
  const copy = STORAGE_SYNC_COPY[locale]
  const metadata = profile.fingerprintConfig.runtimeMetadata
  const version = metadata.lastStorageStateVersion
  const syncedAt = metadata.lastStorageStateSyncedAt
  const baseDetail = [
    version > 0 ? `${copy.version} ${version}` : '',
    syncedAt ? formatLocalizedDate(syncedAt, locale, emptyDateLabel) : '',
  ]
    .filter(Boolean)
    .join(' · ')

  if (metadata.lastStorageStateSyncStatus === 'conflict') {
    return {
      label: copy.conflict,
      detail: metadata.lastStorageStateSyncMessage || copy.conflictDetail,
      className: 'conflict',
    }
  }
  if (metadata.lastStorageStateSyncStatus === 'error') {
    return {
      label: copy.error,
      detail: metadata.lastStorageStateSyncMessage || baseDetail,
      className: 'error',
    }
  }
  if (metadata.lastStorageStateSyncStatus === 'pending') {
    return {
      label: copy.pending,
      detail: metadata.lastStorageStateSyncMessage || baseDetail || copy.pendingDetail,
      className: 'pending',
    }
  }
  if (metadata.lastStorageStateSyncStatus === 'synced' || version > 0) {
    return {
      label: copy.synced,
      detail: baseDetail || metadata.lastStorageStateSyncMessage,
      className: 'synced',
    }
  }
  return {
    label: copy.idle,
    detail: metadata.lastStorageStateSyncMessage || copy.idleDetail,
    className: 'idle',
  }
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
