import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { DesktopApi } from '../shared/ipc'
import type {
  CloudPhoneProviderHealth,
  CloudPhoneProviderSummary,
  CloudPhoneRecord,
  DashboardSummary,
  DesktopAuthState,
  DesktopRuntimeInfo,
  DesktopUpdateState,
  DetectedLocalEmulator,
  LogEntry,
  ProfileRecord,
  ProxyRecord,
  RuntimeHostInfo,
  RuntimeStatus,
  SettingsPayload,
  TemplateRecord,
} from '../shared/types'

type AgentState = Awaited<ReturnType<DesktopApi['meta']['getAgentState']>>

const EMPTY_DASHBOARD_SUMMARY: DashboardSummary = {
  totalProfiles: 0,
  runningProfiles: 0,
  totalProxies: 0,
  onlineProxies: 0,
  totalCloudPhones: 0,
  runningCloudPhones: 0,
  cloudPhoneErrors: 0,
  logCount: 0,
}

const DESKTOP_POLL_INTERVAL_MS = 10_000
type RefreshAllOptions = {
  includeCloudPhoneDiagnostics?: boolean
}

export function useDesktopAppData({
  requireDesktopApi,
  localizeError,
  currentView,
  rendererVersion,
  setErrorMessage,
  setSyncWarningMessage,
  setSettings,
}: {
  requireDesktopApi: (requiredPaths?: string[]) => DesktopApi
  localizeError: (error: unknown) => string
  currentView: 'dashboard' | 'profiles' | 'cloudPhones' | 'proxies' | 'logs' | 'settings' | 'account'
  rendererVersion: string
  setErrorMessage: Dispatch<SetStateAction<string>>
  setSyncWarningMessage: Dispatch<SetStateAction<string>>
  setSettings: Dispatch<SetStateAction<SettingsPayload>>
}) {
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_DASHBOARD_SUMMARY)
  const [cloudPhones, setCloudPhones] = useState<CloudPhoneRecord[]>([])
  const [cloudPhoneProviders, setCloudPhoneProviders] = useState<CloudPhoneProviderSummary[]>([])
  const [cloudPhoneProviderHealth, setCloudPhoneProviderHealth] = useState<CloudPhoneProviderHealth[]>([])
  const [localEmulatorDevices, setLocalEmulatorDevices] = useState<DetectedLocalEmulator[]>([])
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [proxies, setProxies] = useState<ProxyRecord[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [directoryInfo, setDirectoryInfo] = useState<{
    appDataDir: string
    profilesDir: string
    chromiumExecutable?: string
  } | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<DesktopRuntimeInfo | null>(null)
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null)
  const [runtimeHostInfo, setRuntimeHostInfo] = useState<RuntimeHostInfo | null>(null)
  const [agentState, setAgentState] = useState<AgentState | null>(null)
  const [updateState, setUpdateState] = useState<DesktopUpdateState | null>(null)
  const [authState, setAuthState] = useState<DesktopAuthState | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const pollInFlightRef = useRef(false)

  const refreshAll = useCallback(async (options: RefreshAllOptions = {}) => {
    const includeCloudPhoneDiagnostics = options.includeCloudPhoneDiagnostics ?? false
    const api = requireDesktopApi([
      'meta.getInfo',
      'dashboard.summary',
      'runtime.getStatus',
      'runtime.getHostInfo',
      'cloudPhones.list',
      'cloudPhones.listProviders',
      'profiles.list',
      'templates.list',
      'proxies.list',
      'logs.list',
      'settings.get',
      'profiles.getDirectoryInfo',
      'meta.getAgentState',
      'updater.getState',
    ])
    const [
      info,
      dashboard,
      nextRuntimeStatus,
      nextRuntimeHostInfo,
      nextCloudPhones,
      nextCloudPhoneProviders,
      nextProfiles,
      nextTemplates,
      nextProxies,
      nextLogs,
      nextSettings,
      dirInfo,
      nextAgentState,
      nextUpdateState,
    ] = await Promise.all([
      api.meta.getInfo(),
      api.dashboard.summary(),
      api.runtime.getStatus(),
      api.runtime.getHostInfo(),
      api.cloudPhones.list(),
      api.cloudPhones.listProviders(),
      api.profiles.list(),
      api.templates.list(),
      api.proxies.list(),
      api.logs.list(),
      api.settings.get(),
      api.profiles.getDirectoryInfo(),
      api.meta.getAgentState(),
      api.updater.getState(),
    ])

    setSummary(dashboard)
    setRuntimeStatus(nextRuntimeStatus)
    setRuntimeHostInfo(nextRuntimeHostInfo)
    setCloudPhones(nextCloudPhones)
    setCloudPhoneProviders(nextCloudPhoneProviders)
    setProfiles(nextProfiles)
    setTemplates(nextTemplates)
    setProxies(nextProxies)
    setLogs(nextLogs)
    setSettings(nextSettings)
    setDirectoryInfo(dirInfo)
    setAgentState(nextAgentState)
    setUpdateState(nextUpdateState)
    setRuntimeInfo({
      ...info,
      rendererVersion,
    })

    if (!includeCloudPhoneDiagnostics) {
      return
    }

    const cloudPhoneApi = requireDesktopApi([
      'cloudPhones.getProviderHealth',
      'cloudPhones.detectLocalDevices',
    ])
    const [nextCloudPhoneProviderHealth, nextLocalEmulatorDevices] = await Promise.all([
      cloudPhoneApi.cloudPhones.getProviderHealth(),
      cloudPhoneApi.cloudPhones.detectLocalDevices(),
    ])
    setCloudPhoneProviderHealth(nextCloudPhoneProviderHealth)
    setLocalEmulatorDevices(nextLocalEmulatorDevices)
  }, [rendererVersion, requireDesktopApi, setSettings])

  useEffect(() => {
    void (async () => {
      try {
        const api = requireDesktopApi(['auth.getState'])
        const nextAuthState = await api.auth.getState()
        setAuthState(nextAuthState)
        await refreshAll({
          includeCloudPhoneDiagnostics: nextAuthState.authenticated,
        })
        if (!nextAuthState.authenticated) {
          setSyncWarningMessage('')
        }
        setAuthReady(true)
      } catch (error) {
        setErrorMessage(localizeError(error))
        setAuthReady(true)
      }
    })()
  }, [localizeError, refreshAll, requireDesktopApi, setErrorMessage, setSyncWarningMessage])

  useEffect(() => {
    if (!authState?.authenticated) {
      return
    }
    const timer = window.setInterval(async () => {
      if (document.querySelector('[data-duokai-pause-polling="true"]')) {
        return
      }
      if (pollInFlightRef.current) {
        return
      }
      pollInFlightRef.current = true
      try {
        const api = requireDesktopApi([
          'profiles.list',
          'dashboard.summary',
          'runtime.getStatus',
          'meta.getAgentState',
        ])
        const [nextProfiles, nextSummary, nextRuntimeStatus, nextAgentState, nextLogs] = await Promise.all([
          api.profiles.list(),
          api.dashboard.summary(),
          api.runtime.getStatus(),
          api.meta.getAgentState(),
          currentView === 'logs' ? requireDesktopApi(['logs.list']).logs.list() : Promise.resolve(null),
        ])
        setProfiles(nextProfiles)
        setSummary(nextSummary)
        setRuntimeStatus(nextRuntimeStatus)
        setAgentState(nextAgentState)
        if (nextLogs) {
          setLogs(nextLogs)
        }
      } catch (error) {
        setErrorMessage(localizeError(error))
      } finally {
        pollInFlightRef.current = false
      }
    }, DESKTOP_POLL_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [authState?.authenticated, currentView, localizeError, requireDesktopApi, setErrorMessage])

  useEffect(() => {
    if (!authState?.authenticated || currentView !== 'logs') {
      return
    }
    void (async () => {
      try {
        const api = requireDesktopApi(['logs.list'])
        setLogs(await api.logs.list())
      } catch (error) {
        setErrorMessage(localizeError(error))
      }
    })()
  }, [authState?.authenticated, currentView, localizeError, requireDesktopApi, setErrorMessage])

  useEffect(() => {
    const api = window.desktop as DesktopApi | undefined
    if (!api?.updater?.onStateChange) {
      return
    }
    return api.updater.onStateChange((nextState) => {
      setUpdateState(nextState)
    })
  }, [])

  useEffect(() => {
    const api = window.desktop as DesktopApi | undefined
    if (!api?.meta?.onConfigChanged) {
      return
    }
    return api.meta.onConfigChanged(() => {
      void (async () => {
        try {
          const authApi = requireDesktopApi(['auth.getState'])
          const nextAuthState = await authApi.auth.getState()
          setAuthState(nextAuthState)
          await refreshAll({
            includeCloudPhoneDiagnostics: nextAuthState.authenticated,
          })
          if (!nextAuthState.authenticated) {
            setSyncWarningMessage('')
          }
        } catch (error) {
          setErrorMessage(localizeError(error))
        }
      })()
    })
  }, [localizeError, refreshAll, requireDesktopApi, setErrorMessage, setSyncWarningMessage])

  const clearAuthenticatedWorkspace = useCallback(() => {
    setProfiles([])
    setSummary(EMPTY_DASHBOARD_SUMMARY)
    setSyncWarningMessage('')
  }, [setSyncWarningMessage])

  return {
    summary,
    setSummary,
    cloudPhones,
    setCloudPhones,
    cloudPhoneProviders,
    cloudPhoneProviderHealth,
    localEmulatorDevices,
    profiles,
    setProfiles,
    templates,
    proxies,
    logs,
    directoryInfo,
    runtimeInfo,
    runtimeStatus,
    runtimeHostInfo,
    agentState,
    updateState,
    setUpdateState,
    authState,
    setAuthState,
    authReady,
    refreshAll,
    clearAuthenticatedWorkspace,
  }
}
