import { useCallback, useMemo } from 'react'
import type { Dictionary, LocaleCode } from '../i18n'
import {
  describeDesktopUpdateStatus,
  getDesktopEnvironmentSyncSummary,
  getDesktopRuntimeArtifactSyncSummaries,
  formatLocalizedDate,
  getDesktopProfileLaunchPhaseLabel,
  getDesktopUpdateActionLabel,
  resolveProfileVisualState,
} from '../lib/desktop-status-helpers'
import type { DesktopApi } from '../shared/ipc'
import type {
  CloudPhoneProviderHealth,
  CloudPhoneProviderSummary,
  DesktopUpdateState,
  ProfileRecord,
  RuntimeStatus,
} from '../shared/types'

type PendingLaunchState = Record<string, number>
type AgentState = Awaited<ReturnType<DesktopApi['meta']['getAgentState']>>

export function useDesktopDerivedState({
  locale,
  t,
  rendererOperatingSystem,
  defaultCloudPhoneProvider,
  profiles,
  cloudPhoneProviders,
  cloudPhoneProviderHealth,
  agentState,
  runtimeStatus,
  pendingProfileLaunches,
}: {
  locale: LocaleCode
  t: Dictionary
  rendererOperatingSystem: string
  defaultCloudPhoneProvider: string
  profiles: ProfileRecord[]
  cloudPhoneProviders: CloudPhoneProviderSummary[]
  cloudPhoneProviderHealth: CloudPhoneProviderHealth[]
  agentState: AgentState | null
  runtimeStatus: RuntimeStatus | null
  pendingProfileLaunches: PendingLaunchState
}) {
  const isZh = locale === 'zh-CN'
  const defaultCloudPhoneProviderHealth = useMemo(
    () =>
      cloudPhoneProviderHealth.find((item) => item.key === defaultCloudPhoneProvider) ?? null,
    [cloudPhoneProviderHealth, defaultCloudPhoneProvider],
  )

  const latestNetworkCheck = useMemo(() => {
    const candidates = profiles
      .map((profile) => ({
        profile,
        resolvedAt: profile.fingerprintConfig.runtimeMetadata.lastResolvedAt,
        checkedAt: profile.fingerprintConfig.runtimeMetadata.lastProxyCheckAt,
      }))
      .filter(
        (item) =>
          Boolean(item.resolvedAt) ||
          Boolean(item.checkedAt) ||
          Boolean(item.profile.fingerprintConfig.runtimeMetadata.lastResolvedIp),
      )
      .sort((left, right) => {
        const leftTime = new Date(
          left.resolvedAt || left.checkedAt || left.profile.updatedAt,
        ).getTime()
        const rightTime = new Date(
          right.resolvedAt || right.checkedAt || right.profile.updatedAt,
        ).getTime()
        return rightTime - leftTime
      })
    const latest = candidates[0]
    if (!latest) {
      return null
    }
    const metadata = latest.profile.fingerprintConfig.runtimeMetadata
    return {
      profileName: latest.profile.name,
      success: metadata.lastProxyCheckSuccess,
      ip: metadata.lastResolvedIp,
      country: metadata.lastResolvedCountry || metadata.lastResolvedRegion,
      timezone: metadata.lastResolvedTimezone,
      message: metadata.lastProxyCheckMessage || '',
      checkedAt:
        metadata.lastProxyCheckAt || metadata.lastResolvedAt || latest.profile.updatedAt,
    }
  }, [profiles])

  const agentReadOnlyMessage = useMemo(() => {
    if (!agentState?.enabled || agentState.writable) {
      return ''
    }
    const lastTask =
      agentState.lastTaskId && agentState.lastTaskStatus
        ? `${agentState.lastTaskId} (${agentState.lastTaskStatus})`
        : ''
    const reason = agentState.lastError
      ? isZh
        ? `（${agentState.lastError}）`
        : ` (${agentState.lastError})`
      : ''
    const taskInfo = lastTask
      ? isZh
        ? `，最近任务：${lastTask}`
        : `. Last task: ${lastTask}`
      : ''
    const failInfo =
      agentState.consecutiveFailures > 0
        ? isZh
          ? `，连续失败：${agentState.consecutiveFailures}`
          : `. Consecutive failures: ${agentState.consecutiveFailures}`
        : ''

    return isZh
      ? `当前为离线只读模式：配置写操作已暂停，等待与控制面恢复连接${reason}${taskInfo}${failInfo}`
      : `Offline read-only mode: config writes are paused until control plane reconnects${reason}${taskInfo}${failInfo}`
  }, [agentState, isZh])

  const cloudPhoneProviderMap = useMemo(
    () => new Map(cloudPhoneProviders.map((item) => [item.key, item])),
    [cloudPhoneProviders],
  )

  const cloudPhoneProviderHealthMap = useMemo(
    () => new Map(cloudPhoneProviderHealth.map((item) => [item.key, item])),
    [cloudPhoneProviderHealth],
  )

  const runtimeRunningIds = useMemo(
    () => new Set(runtimeStatus?.runningProfileIds ?? []),
    [runtimeStatus],
  )

  const runtimeQueuedIds = useMemo(
    () => new Set(runtimeStatus?.queuedProfileIds ?? []),
    [runtimeStatus],
  )

  const runtimeStartingIds = useMemo(
    () => new Set(runtimeStatus?.startingProfileIds ?? []),
    [runtimeStatus],
  )

  const runtimeLaunchStages = useMemo(() => runtimeStatus?.launchStages ?? {}, [runtimeStatus])

  const getProfileVisualState = useCallback(
    (profile: ProfileRecord) =>
      resolveProfileVisualState(profile, {
        pendingProfileLaunches,
        runtimeQueuedIds,
        runtimeStartingIds,
      }),
    [pendingProfileLaunches, runtimeQueuedIds, runtimeStartingIds],
  )

  const getLaunchPhaseLabel = useCallback(
    (profile: ProfileRecord) =>
      getDesktopProfileLaunchPhaseLabel(profile, runtimeLaunchStages, locale),
    [locale, runtimeLaunchStages],
  )

  const getEnvironmentSyncSummary = useCallback(
    (profile: ProfileRecord) => getDesktopEnvironmentSyncSummary(profile, locale, t.common.never),
    [locale, t.common.never],
  )

  const getRuntimeArtifactSyncSummaries = useCallback(
    (profile: ProfileRecord) => getDesktopRuntimeArtifactSyncSummaries(profile, locale, t.common.never),
    [locale, t.common.never],
  )

  const formatDate = useCallback(
    (value: string | null) => formatLocalizedDate(value, locale, t.common.never),
    [locale, t.common.never],
  )

  const describeUpdateStatus = useCallback(
    (state: DesktopUpdateState | null) =>
      describeDesktopUpdateStatus(state, locale, rendererOperatingSystem),
    [locale, rendererOperatingSystem],
  )

  const getUpdateActionLabel = useCallback(
    (state: DesktopUpdateState | null) =>
      getDesktopUpdateActionLabel(state, locale, rendererOperatingSystem),
    [locale, rendererOperatingSystem],
  )

  const renderProviderLabel = useCallback(
    (providerKey: string): string => {
      const localizedLabels: Record<string, string> = {
        'self-hosted': t.cloudPhones.providerSelfHosted,
        'third-party': t.cloudPhones.providerThirdParty,
        'local-emulator': t.cloudPhones.providerLocalEmulator,
        mock: t.cloudPhones.providerMock,
      }
      if (localizedLabels[providerKey]) {
        return localizedLabels[providerKey]
      }
      const provider = cloudPhoneProviderMap.get(providerKey)
      return provider?.label ?? providerKey
    },
    [
      cloudPhoneProviderMap,
      t.cloudPhones.providerLocalEmulator,
      t.cloudPhones.providerMock,
      t.cloudPhones.providerSelfHosted,
      t.cloudPhones.providerThirdParty,
    ],
  )

  return {
    defaultCloudPhoneProviderHealth,
    latestNetworkCheck,
    agentReadOnlyMessage,
    cloudPhoneProviderMap,
    cloudPhoneProviderHealthMap,
    runtimeRunningIds,
    runtimeQueuedIds,
    runtimeStartingIds,
    runtimeLaunchStages,
    getProfileVisualState,
    getLaunchPhaseLabel,
    getEnvironmentSyncSummary,
    getRuntimeArtifactSyncSummaries,
    formatDate,
    describeUpdateStatus,
    getUpdateActionLabel,
    renderProviderLabel,
  }
}
