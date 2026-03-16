import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import {
  dictionaries,
  getLocaleFromSettings,
  translateLogCategory,
  translateLogLevel,
  translateStatus,
} from './i18n'
import type {
  CloudPhoneDetails,
  CloudPhoneFingerprintSettings,
  CloudPhoneProviderConfig,
  CloudPhoneProviderHealth,
  CloudPhoneProviderKind,
  CloudPhoneProviderSummary,
  CloudPhoneRecord,
  CreateCloudPhoneInput,
  DashboardSummary,
  DesktopRuntimeInfo,
  DetectedLocalEmulator,
  FingerprintConfig,
  ImportResult,
  LogEntry,
  ProfileRecord,
  ProxyRecord,
  ProxyType,
  SettingsPayload,
  TemplateRecord,
} from './shared/types'
import type { DesktopApi } from './shared/ipc'
import {
  DEFAULT_ENVIRONMENT_LANGUAGE,
  SUPPORTED_ENVIRONMENT_LANGUAGES,
  normalizeEnvironmentLanguage,
} from './shared/environmentLanguages'

type ViewKey = 'dashboard' | 'profiles' | 'cloudPhones' | 'proxies' | 'logs' | 'settings'
type ResourceMode = 'profiles' | 'templates'
type EditorPageMode = 'list' | 'create' | 'edit'
type StatusFilter = 'all' | ProfileRecord['status']
type DesktopRuntimeApi = DesktopApi
type ProfileFormState = {
  name: string
  proxyId: string | null
  groupName: string
  tagsText: string
  notes: string
  fingerprintConfig: FingerprintConfig
}

type TemplateFormState = ProfileFormState
type CloudPhoneFormState = CreateCloudPhoneInput

const CLOUD_PHONE_PROVIDER_KIND_MAP: Record<string, CloudPhoneProviderKind> = {
  'self-hosted': 'self-hosted',
  'third-party': 'third-party',
  'local-emulator': 'local-emulator',
  mock: 'mock',
}

const defaultFingerprint: FingerprintConfig = {
  userAgent:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  language: DEFAULT_ENVIRONMENT_LANGUAGE,
  timezone: '',
  resolution: '1440x900',
  webrtcMode: 'default',
  basicSettings: {
    platform: '',
    customPlatformName: '',
    customPlatformUrl: '',
    platformUsername: '',
    platformPassword: '',
    validateByUsername: false,
    multiOpenMode: 'allow',
    twoFactorSecret: '',
    cookieSeed: '',
  },
  proxySettings: {
    proxyMode: 'direct',
    ipLookupChannel: 'IP2Location',
    proxyType: 'http',
    ipProtocol: 'ipv4',
    host: '',
    port: 0,
    username: '',
    password: '',
    udpEnabled: false,
  },
  commonSettings: {
    pageMode: 'local',
    blockImages: false,
    blockImagesAboveKb: 0,
    syncTabs: true,
    syncCookies: true,
    clearCacheOnLaunch: false,
    randomizeFingerprintOnLaunch: false,
    allowChromeLogin: false,
    hardwareAcceleration: true,
    memorySaver: false,
  },
  advanced: {
    browserKernel: 'chrome',
    browserKernelVersion: '140',
    deviceMode: 'desktop',
    operatingSystem: 'Windows',
    operatingSystemVersion: '',
    browserVersion: '136',
    autoLanguageFromIp: true,
    autoInterfaceLanguageFromIp: false,
    interfaceLanguage: '',
    autoTimezoneFromIp: true,
    autoGeolocationFromIp: true,
    geolocationPermission: 'ask',
    geolocation: '',
    windowWidth: 1280,
    windowHeight: 720,
    resolutionMode: 'system',
    fontMode: 'system',
    canvasMode: 'random',
    webglImageMode: 'random',
    webglMetadataMode: 'custom',
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Ti Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.15.4633)',
    audioContextMode: 'random',
    mediaDevicesMode: 'off',
    speechVoicesMode: 'random',
    doNotTrackEnabled: false,
    clientRectsMode: 'random',
    deviceInfoMode: 'custom',
    deviceName: 'DESKTOP-U09K1H5',
    hostIp: '172.25.254.247',
    macAddress: '88-B1-11-1B-9D-9E',
    portScanProtection: true,
    portScanAllowlist: '',
    sslFingerprintMode: 'disabled',
    customPluginFingerprint: 'disabled',
    cpuMode: 'system',
    cpuCores: 8,
    memoryGb: 8,
    launchArgs: '',
  },
  runtimeMetadata: {
    lastResolvedIp: '',
    lastResolvedCountry: '',
    lastResolvedRegion: '',
    lastResolvedCity: '',
    lastResolvedTimezone: '',
    lastResolvedLanguage: '',
    lastResolvedGeolocation: '',
    lastResolvedAt: '',
    lastProxyCheckAt: '',
    lastProxyCheckSuccess: null,
    lastProxyCheckMessage: '',
    lastValidationLevel: 'unknown',
    lastValidationMessages: [],
    launchRetryCount: 0,
    injectedFeatures: [],
  },
}

function randomDesktopFingerprint(current: FingerprintConfig): FingerprintConfig {
  const resolutions = ['1280x720', '1366x768', '1440x900', '1600x900', '1920x1080']
  const resolution = resolutions[Math.floor(Math.random() * resolutions.length)] ?? current.resolution
  const [width, height] = resolution.split('x').map(Number)
  return {
    ...current,
    resolution,
    userAgent: current.userAgent.replace(/Chrome\/\d+\.\d+\.\d+\.\d+/, `Chrome/${136 + Math.floor(Math.random() * 4)}.0.0.0`),
    advanced: {
      ...current.advanced,
      windowWidth: width || current.advanced.windowWidth,
      windowHeight: height || current.advanced.windowHeight,
      deviceName: `DESKTOP-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
      hostIp: `172.${20 + Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      macAddress: Array.from({ length: 6 }, () =>
        Math.floor(Math.random() * 256)
          .toString(16)
          .padStart(2, '0')
          .toUpperCase(),
      ).join('-'),
      cpuCores: [4, 8, 12, 16][Math.floor(Math.random() * 4)] ?? current.advanced.cpuCores,
      memoryGb: [4, 8, 16, 32][Math.floor(Math.random() * 4)] ?? current.advanced.memoryGb,
    },
  }
}

function normalizeTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function cloneFingerprintConfig(base: FingerprintConfig = defaultFingerprint): FingerprintConfig {
  return {
    ...base,
    basicSettings: { ...base.basicSettings },
    proxySettings: { ...base.proxySettings },
    commonSettings: { ...base.commonSettings },
    advanced: { ...base.advanced },
    runtimeMetadata: {
      ...base.runtimeMetadata,
      lastValidationMessages: [...base.runtimeMetadata.lastValidationMessages],
      injectedFeatures: [...base.runtimeMetadata.injectedFeatures],
    },
  }
}

function emptyProfile(
  proxyId: string | null = null,
  defaultLanguage: string = DEFAULT_ENVIRONMENT_LANGUAGE,
): ProfileFormState {
  return {
    name: '',
    proxyId,
    groupName: '',
    tagsText: '',
    notes: '',
    fingerprintConfig: {
      ...cloneFingerprintConfig(defaultFingerprint),
      language: normalizeEnvironmentLanguage(defaultLanguage),
    },
  }
}

function emptyTemplate(proxyId: string | null = null): TemplateFormState {
  return {
    name: '',
    proxyId,
    groupName: '',
    tagsText: '',
    notes: '',
    fingerprintConfig: cloneFingerprintConfig(defaultFingerprint),
  }
}

function isBlankProfileForm(form: ProfileFormState): boolean {
  return (
    form.name.trim().length === 0 &&
    form.groupName.trim().length === 0 &&
    form.tagsText.trim().length === 0 &&
    form.notes.trim().length === 0
  )
}

function emptyProxy() {
  return {
    name: '',
    type: 'http' as ProxyType,
    host: '',
    port: 8080,
    username: '',
    password: '',
  }
}

function buildProviderConfig(
  providerKey: string,
  settings: SettingsPayload,
  current?: CloudPhoneProviderConfig,
): CloudPhoneProviderConfig {
  const currentConfig = current ?? {}
  if (providerKey === 'self-hosted') {
    return {
      ...currentConfig,
      baseUrl: currentConfig.baseUrl ?? settings.selfHostedCloudPhoneBaseUrl ?? '',
      apiKey: currentConfig.apiKey ?? settings.selfHostedCloudPhoneApiKey ?? '',
      clusterId: currentConfig.clusterId ?? settings.selfHostedCloudPhoneClusterId ?? '',
      poolId: currentConfig.poolId ?? '',
    }
  }
  if (providerKey === 'third-party') {
    return {
      ...currentConfig,
      vendorKey: currentConfig.vendorKey ?? settings.thirdPartyCloudPhoneVendor ?? '',
      baseUrl: currentConfig.baseUrl ?? settings.thirdPartyCloudPhoneBaseUrl ?? '',
      token: currentConfig.token ?? settings.thirdPartyCloudPhoneToken ?? '',
      projectId: currentConfig.projectId ?? '',
    }
  }
  if (providerKey === 'local-emulator') {
    return {
      ...currentConfig,
      adbPath: currentConfig.adbPath ?? settings.localEmulatorAdbPath ?? 'adb',
      adbSerial: currentConfig.adbSerial ?? '',
      emulatorName: currentConfig.emulatorName ?? '',
    }
  }
  return currentConfig
}

function providerKindForKey(providerKey: string): CloudPhoneProviderKind {
  return CLOUD_PHONE_PROVIDER_KIND_MAP[providerKey] ?? 'mock'
}

function emptyCloudPhone(
  settings: SettingsPayload = {},
  defaultProviderKey: string = settings.defaultCloudPhoneProvider || 'self-hosted',
): CloudPhoneFormState {
  const fingerprintSettings: CloudPhoneFingerprintSettings = {
    autoLanguage: true,
    language: null,
    autoTimezone: true,
    timezone: null,
    autoGeolocation: true,
    geolocation: null,
  }

  return {
    name: '',
    groupName: '',
    tags: [],
    notes: '',
    platform: 'android',
    providerKey: defaultProviderKey,
    providerKind: providerKindForKey(defaultProviderKey),
    providerConfig: buildProviderConfig(defaultProviderKey, settings),
    providerInstanceId: null,
    computeType: 'basic',
    ipLookupChannel: 'IP2Location',
    proxyType: 'socks5',
    ipProtocol: 'ipv4',
    proxyHost: '',
    proxyPort: 0,
    proxyUsername: '',
    proxyPassword: '',
    udpEnabled: true,
    fingerprintSettings,
  }
}

function getNestedValue(target: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return undefined
    }
    return (current as Record<string, unknown>)[key]
  }, target)
}

function App() {
  const [view, setView] = useState<ViewKey>('dashboard')
  const [resourceMode, setResourceMode] = useState<ResourceMode>('profiles')
  const [summary, setSummary] = useState<DashboardSummary>({
    totalProfiles: 0,
    runningProfiles: 0,
    totalProxies: 0,
    onlineProxies: 0,
    totalCloudPhones: 0,
    runningCloudPhones: 0,
    cloudPhoneErrors: 0,
    logCount: 0,
  })
  const [cloudPhones, setCloudPhones] = useState<CloudPhoneRecord[]>([])
  const [cloudPhoneProviders, setCloudPhoneProviders] = useState<CloudPhoneProviderSummary[]>([])
  const [cloudPhoneProviderHealth, setCloudPhoneProviderHealth] = useState<
    CloudPhoneProviderHealth[]
  >([])
  const [localEmulatorDevices, setLocalEmulatorDevices] = useState<DetectedLocalEmulator[]>([])
  const [profiles, setProfiles] = useState<ProfileRecord[]>([])
  const [templates, setTemplates] = useState<TemplateRecord[]>([])
  const [proxies, setProxies] = useState<ProxyRecord[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [settings, setSettings] = useState<SettingsPayload>({})
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [selectedCloudPhoneId, setSelectedCloudPhoneId] = useState<string | null>(null)
  const [profilePageMode, setProfilePageMode] = useState<EditorPageMode>('list')
  const [cloudPhonePageMode, setCloudPhonePageMode] = useState<EditorPageMode>('list')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [selectedProxyId, setSelectedProxyId] = useState<string | null>(null)
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([])
  const [selectedCloudPhoneIds, setSelectedCloudPhoneIds] = useState<string[]>([])
  const [profileForm, setProfileForm] = useState(emptyProfile())
  const [cloudPhoneForm, setCloudPhoneForm] = useState<CloudPhoneFormState>(emptyCloudPhone())
  const [templateForm, setTemplateForm] = useState(emptyTemplate())
  const [proxyForm, setProxyForm] = useState(emptyProxy())
  const [directoryInfo, setDirectoryInfo] = useState<{
    appDataDir: string
    profilesDir: string
    chromiumExecutable?: string
  } | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<DesktopRuntimeInfo | null>(null)
  const [busyMessage, setBusyMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [cloudPhoneSearchQuery, setCloudPhoneSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [batchGroupName, setBatchGroupName] = useState('')
  const [cloudPhoneGroupFilter, setCloudPhoneGroupFilter] = useState('all')
  const [cloudPhoneBatchGroupName, setCloudPhoneBatchGroupName] = useState('')
  const [cloudPhoneDetails, setCloudPhoneDetails] = useState<CloudPhoneDetails | null>(null)
  const [showMoreProfileCommon, setShowMoreProfileCommon] = useState(false)
  const [showMoreProfileFingerprint, setShowMoreProfileFingerprint] = useState(false)

  const locale = getLocaleFromSettings(settings.uiLanguage)
  const t = dictionaries[locale]
  const defaultEnvironmentLanguage = normalizeEnvironmentLanguage(
    settings.defaultEnvironmentLanguage,
  )
  const defaultCloudPhoneProvider = settings.defaultCloudPhoneProvider || 'self-hosted'
  const defaultCloudPhoneProviderHealth = useMemo(
    () =>
      cloudPhoneProviderHealth.find((item) => item.key === defaultCloudPhoneProvider) ?? null,
    [cloudPhoneProviderHealth, defaultCloudPhoneProvider],
  )
  const profileBackLabel = locale === 'zh-CN' ? '返回列表' : 'Back to list'
  const cloudPhoneBackLabel = locale === 'zh-CN' ? '返回列表' : 'Back to list'
  const showProfileWorkspaceList = resourceMode === 'profiles' && profilePageMode === 'list'
  const showProfileWorkspaceEditor = resourceMode === 'profiles' && profilePageMode !== 'list'
  const showTemplateWorkspace = resourceMode === 'templates'
  const showCloudPhoneList = cloudPhonePageMode === 'list'
  const showCloudPhoneEditor = cloudPhonePageMode !== 'list'

  const bridgeUnavailableMessage = useCallback((path?: string) => {
    if (locale === 'zh-CN') {
      return path
        ? `应用桥接未同步，缺少接口 ${path}。请完全关闭当前开发窗口后重新执行 npm run dev。`
        : '应用桥接未同步，请完全关闭当前开发窗口后重新执行 npm run dev。'
    }
    return path
      ? `Desktop bridge is out of sync. Missing API ${path}. Fully close the current dev window and run npm run dev again.`
      : 'Desktop bridge is out of sync. Fully close the current dev window and run npm run dev again.'
  }, [locale])

  const localizeError = useCallback((error: unknown) => {
    if (!(error instanceof Error)) {
      return locale === 'zh-CN' ? '发生未知错误。' : 'Unknown error.'
    }

    if (
      error.message.startsWith('BRIDGE_UNAVAILABLE:') ||
      error.message.startsWith('MISSING_API:') ||
      error.message.includes("Cannot read properties of undefined")
    ) {
      const path = error.message.split(':').slice(1).join(':').trim() || undefined
      return bridgeUnavailableMessage(path)
    }

    if (error.message.startsWith('VALIDATION:')) {
      return error.message.replace('VALIDATION:', '').trim()
    }

    return error.message
  }, [bridgeUnavailableMessage, locale])

  const requireDesktopApi = useCallback((requiredPaths: string[] = []) => {
    const api = window.desktop as DesktopRuntimeApi | undefined
    if (!api) {
      throw new Error('BRIDGE_UNAVAILABLE:')
    }
    for (const path of requiredPaths) {
      if (typeof getNestedValue(api, path) === 'undefined') {
        throw new Error(`MISSING_API:${path}`)
      }
    }
    return api
  }, [])

  const views: { key: ViewKey; label: string }[] = [
    { key: 'dashboard', label: t.nav.dashboard },
    { key: 'profiles', label: t.nav.profiles },
    { key: 'cloudPhones', label: t.nav.cloudPhones },
    { key: 'proxies', label: t.nav.proxies },
    { key: 'logs', label: t.nav.logs },
    { key: 'settings', label: t.nav.settings },
  ]

  const groupOptions = useMemo(() => {
    return Array.from(
      new Set(
        profiles
          .map((profile) => profile.groupName || t.profiles.groupFallback)
          .filter(Boolean),
      ),
    )
  }, [profiles, t.profiles.groupFallback])

  const cloudPhoneGroupOptions = useMemo(() => {
    return Array.from(
      new Set(
        cloudPhones
          .map((item) => item.groupName || t.profiles.groupFallback)
          .filter(Boolean),
      ),
    )
  }, [cloudPhones, t.profiles.groupFallback])

  const cloudPhoneProviderMap = useMemo(
    () => new Map(cloudPhoneProviders.map((item) => [item.key, item])),
    [cloudPhoneProviders],
  )

  const cloudPhoneProviderHealthMap = useMemo(
    () => new Map(cloudPhoneProviderHealth.map((item) => [item.key, item])),
    [cloudPhoneProviderHealth],
  )

  function formatDate(value: string | null) {
    if (!value) {
      return t.common.never
    }
    return new Date(value).toLocaleString(locale)
  }

  const pageHeading =
    view === 'cloudPhones'
      ? { title: t.cloudPhones.title, subtitle: t.cloudPhones.subtitle }
      : { title: t.dashboard.title, subtitle: t.dashboard.subtitle }

  const refreshAll = useCallback(async () => {
    const api = requireDesktopApi([
      'meta.getInfo',
      'dashboard.summary',
      'cloudPhones.list',
      'cloudPhones.listProviders',
      'cloudPhones.getProviderHealth',
      'cloudPhones.detectLocalDevices',
      'profiles.list',
      'templates.list',
      'proxies.list',
      'logs.list',
      'settings.get',
      'profiles.getDirectoryInfo',
    ])
    const [
      dashboard,
      nextCloudPhones,
      nextCloudPhoneProviders,
      nextCloudPhoneProviderHealth,
      nextLocalEmulatorDevices,
      nextProfiles,
      nextTemplates,
      nextProxies,
      nextLogs,
      nextSettings,
      dirInfo,
    ] =
      await Promise.all([
        api.dashboard.summary(),
        api.cloudPhones.list(),
        api.cloudPhones.listProviders(),
        api.cloudPhones.getProviderHealth(),
        api.cloudPhones.detectLocalDevices(),
        api.profiles.list(),
        api.templates.list(),
        api.proxies.list(),
        api.logs.list(),
        api.settings.get(),
        api.profiles.getDirectoryInfo(),
      ])
    const info = await api.meta.getInfo()

    setSummary(dashboard)
    setCloudPhones(nextCloudPhones)
    setCloudPhoneProviders(nextCloudPhoneProviders)
    setCloudPhoneProviderHealth(nextCloudPhoneProviderHealth)
    setLocalEmulatorDevices(nextLocalEmulatorDevices)
    setProfiles(nextProfiles)
    setTemplates(nextTemplates)
    setProxies(nextProxies)
    setLogs(nextLogs)
    setSettings(nextSettings)
    setDirectoryInfo(dirInfo)
    setRuntimeInfo({
      ...info,
      rendererVersion: __APP_VERSION__,
    })
  }, [requireDesktopApi])

  useEffect(() => {
    void (async () => {
      try {
        await refreshAll()
      } catch (error) {
        setErrorMessage(localizeError(error))
      }
    })()
  }, [localizeError, refreshAll])

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const api = requireDesktopApi([
          'cloudPhones.refreshStatuses',
          'profiles.list',
          'dashboard.summary',
        ])
        const [nextCloudPhones, nextProfiles, nextSummary] = await Promise.all([
          api.cloudPhones.refreshStatuses(),
          api.profiles.list(),
          api.dashboard.summary(),
        ])
        setProfiles(nextProfiles)
        setSummary(nextSummary)
        setCloudPhones(nextCloudPhones)
      } catch (error) {
        setErrorMessage(localizeError(error))
        return
      }
    }, 2000)

    return () => window.clearInterval(timer)
  }, [localizeError, requireDesktopApi])

  useEffect(() => {
    if (!selectedProfileId) {
      return
    }
    const profile = profiles.find((item) => item.id === selectedProfileId)
    if (!profile) {
      return
    }
    setProfileForm({
      name: profile.name,
      proxyId: profile.proxyId,
      groupName: profile.groupName,
      tagsText: profile.tags.join(', '),
      notes: profile.notes,
      fingerprintConfig: cloneFingerprintConfig(profile.fingerprintConfig),
    })
  }, [selectedProfileId, profiles])

  useEffect(() => {
    if (!selectedCloudPhoneId) {
      return
    }
    const cloudPhone = cloudPhones.find((item) => item.id === selectedCloudPhoneId)
    if (!cloudPhone) {
      return
    }
    setCloudPhoneForm({
      name: cloudPhone.name,
      groupName: cloudPhone.groupName,
      tags: cloudPhone.tags,
      notes: cloudPhone.notes,
      platform: 'android',
      providerKey: cloudPhone.providerKey,
      providerKind: cloudPhone.providerKind,
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
    })
  }, [cloudPhones, selectedCloudPhoneId])

  useEffect(() => {
    if (!selectedTemplateId) {
      return
    }
    const template = templates.find((item) => item.id === selectedTemplateId)
    if (!template) {
      return
    }
    setTemplateForm({
      name: template.name,
      proxyId: template.proxyId,
      groupName: template.groupName,
      tagsText: template.tags.join(', '),
      notes: template.notes,
      fingerprintConfig: cloneFingerprintConfig(template.fingerprintConfig),
    })
  }, [selectedTemplateId, templates])

  useEffect(() => {
    if (!selectedProxyId) {
      return
    }
    const proxy = proxies.find((item) => item.id === selectedProxyId)
    if (!proxy) {
      return
    }
    setProxyForm({
      name: proxy.name,
      type: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
    })
  }, [selectedProxyId, proxies])

  useEffect(() => {
    if (selectedProfileId) {
      return
    }
    if (!isBlankProfileForm(profileForm)) {
      return
    }
    if (profileForm.fingerprintConfig.language === defaultEnvironmentLanguage) {
      return
    }
    setProfileForm((current) => ({
      ...current,
      fingerprintConfig: {
        ...current.fingerprintConfig,
        language: defaultEnvironmentLanguage,
      },
    }))
  }, [defaultEnvironmentLanguage, profileForm, selectedProfileId])

  useEffect(() => {
    if (selectedCloudPhoneId) {
      return
    }
    setCloudPhoneForm((current) => {
      const isBlank =
        current.name.trim().length === 0 &&
        current.groupName.trim().length === 0 &&
        current.tags.length === 0 &&
        current.notes.trim().length === 0 &&
        current.proxyHost.trim().length === 0 &&
        current.proxyPort === 0 &&
        current.proxyUsername.trim().length === 0 &&
        current.proxyPassword.trim().length === 0
      if (!isBlank) {
        return current
      }
      const nextProviderKey = current.providerKey || defaultCloudPhoneProvider
      return {
        ...current,
        providerKey: nextProviderKey,
        providerKind: providerKindForKey(nextProviderKey),
        providerConfig: buildProviderConfig(nextProviderKey, settings, current.providerConfig),
      }
    })
  }, [defaultCloudPhoneProvider, selectedCloudPhoneId, settings])

  const filteredProfiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return profiles.filter((profile) => {
      const profileGroup = profile.groupName || t.profiles.groupFallback
      const matchesQuery =
        query.length === 0 ||
        profile.name.toLowerCase().includes(query) ||
        profile.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        profileGroup.toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || profile.status === statusFilter
      const matchesGroup = groupFilter === 'all' || profileGroup === groupFilter
      return matchesQuery && matchesStatus && matchesGroup
    })
  }, [groupFilter, profiles, searchQuery, statusFilter, t.profiles.groupFallback])

  const filteredCloudPhones = useMemo(() => {
    const query = cloudPhoneSearchQuery.trim().toLowerCase()
    return cloudPhones.filter((item) => {
      const itemGroup = item.groupName || t.profiles.groupFallback
      const matchesQuery =
        query.length === 0 ||
        item.name.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        itemGroup.toLowerCase().includes(query)
      const matchesGroup = cloudPhoneGroupFilter === 'all' || itemGroup === cloudPhoneGroupFilter
      return matchesQuery && matchesGroup
    })
  }, [cloudPhoneGroupFilter, cloudPhoneSearchQuery, cloudPhones, t.profiles.groupFallback])

  const groupedCloudPhones = useMemo(() => {
    return filteredCloudPhones.reduce<Record<string, CloudPhoneRecord[]>>((acc, item) => {
      const key = item.groupName || t.profiles.groupFallback
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(item)
      return acc
    }, {})
  }, [filteredCloudPhones, t.profiles.groupFallback])

  const groupedProfiles = useMemo(() => {
    return filteredProfiles.reduce<Record<string, ProfileRecord[]>>((acc, profile) => {
      const key = profile.groupName || t.profiles.groupFallback
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(profile)
      return acc
    }, {})
  }, [filteredProfiles, t.profiles.groupFallback])

  async function withBusy(message: string, action: () => Promise<void>) {
    setBusyMessage(message)
    setErrorMessage('')
    setNoticeMessage('')
    try {
      await action()
      await refreshAll()
    } catch (error) {
      setErrorMessage(localizeError(error))
    } finally {
      setBusyMessage('')
    }
  }

  function toggleProfileSelection(profileId: string) {
    setSelectedProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((item) => item !== profileId)
        : [...current, profileId],
    )
  }

  function toggleCloudPhoneSelection(cloudPhoneId: string) {
    setSelectedCloudPhoneIds((current) =>
      current.includes(cloudPhoneId)
        ? current.filter((item) => item !== cloudPhoneId)
        : [...current, cloudPhoneId],
    )
  }

  function openCreateProfilePage() {
    setSelectedProfileId(null)
    setProfileForm(emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage))
    setProfilePageMode('create')
  }

  function openEditProfilePage(profileId: string) {
    setSelectedProfileId(profileId)
    setProfilePageMode('edit')
  }

  function returnToProfileList() {
    setSelectedProfileId(null)
    setProfilePageMode('list')
  }

  function openCreateCloudPhonePage() {
    setSelectedCloudPhoneId(null)
    setCloudPhoneDetails(null)
    setCloudPhoneForm(emptyCloudPhone(settings, defaultCloudPhoneProvider))
    setCloudPhonePageMode('create')
  }

  function openEditCloudPhonePage(cloudPhoneId: string) {
    setSelectedCloudPhoneId(cloudPhoneId)
    setCloudPhonePageMode('edit')
  }

  function returnToCloudPhoneList() {
    setSelectedCloudPhoneId(null)
    setCloudPhoneDetails(null)
    setCloudPhonePageMode('list')
  }

  function loadTemplateIntoProfile(template: TemplateRecord) {
    setResourceMode('profiles')
    setSelectedProfileId(null)
    setProfilePageMode('create')
    setProfileForm({
      name: '',
      proxyId: template.proxyId,
      groupName: template.groupName,
      tagsText: template.tags.join(', '),
      notes: template.notes,
      fingerprintConfig: {
        ...cloneFingerprintConfig(template.fingerprintConfig),
        runtimeMetadata: {
          ...defaultFingerprint.runtimeMetadata,
          lastValidationMessages: [],
          injectedFeatures: [],
        },
      },
    })
  }

  async function saveProfile() {
    await withBusy(
      selectedProfileId ? t.busy.updateProfile : t.busy.createProfile,
      async () => {
        if (profileForm.name.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '环境名称不能为空。' : 'Profile name is required.'}`,
          )
        }
        if (
          profileForm.fingerprintConfig.proxySettings.proxyMode === 'manager' &&
          !profileForm.proxyId
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '请选择代理管理中的代理。' : 'Select a managed proxy.'}`,
          )
        }
        if (
          profileForm.fingerprintConfig.proxySettings.proxyMode === 'custom' &&
          profileForm.fingerprintConfig.proxySettings.host.trim().length === 0
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '自定义代理主机不能为空。' : 'Custom proxy host is required.'}`,
          )
        }
        if (
          profileForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          profileForm.fingerprintConfig.basicSettings.customPlatformName.trim().length === 0
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '自定义平台名称不能为空。' : 'Custom platform name is required.'}`,
          )
        }
        if (
          profileForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim().length > 0 &&
          !/^https?:\/\//i.test(profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim())
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '平台 URL 需以 http:// 或 https:// 开头。' : 'Platform URL must start with http:// or https://.'}`,
          )
        }
        const api = requireDesktopApi(['profiles.create', 'profiles.update'])
        const payload = {
          name: profileForm.name.trim(),
          proxyId:
            profileForm.fingerprintConfig.proxySettings.proxyMode === 'manager'
              ? profileForm.proxyId || null
              : null,
          groupName: profileForm.groupName,
          tags: normalizeTags(profileForm.tagsText),
          notes: profileForm.notes,
          fingerprintConfig: {
            ...profileForm.fingerprintConfig,
            basicSettings: {
              ...profileForm.fingerprintConfig.basicSettings,
              customPlatformName:
                profileForm.fingerprintConfig.basicSettings.platform === 'custom'
                  ? profileForm.fingerprintConfig.basicSettings.customPlatformName.trim()
                  : '',
              customPlatformUrl:
                profileForm.fingerprintConfig.basicSettings.platform === 'custom'
                  ? profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim()
                  : '',
            },
            resolution: `${profileForm.fingerprintConfig.advanced.windowWidth}x${profileForm.fingerprintConfig.advanced.windowHeight}`,
          },
        }

        if (selectedProfileId) {
          await api.profiles.update({
            id: selectedProfileId,
            ...payload,
          })
        } else {
          await api.profiles.create(payload)
        }
        setSelectedProfileId(null)
        setProfilePageMode('list')
        setProfileForm(emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage))
        setNoticeMessage(
          locale === 'zh-CN' ? '环境已保存，列表已刷新。' : 'Profile saved and list refreshed.',
        )
      },
    )
  }

  async function saveTemplate() {
    await withBusy(
      selectedTemplateId ? t.busy.updateTemplate : t.busy.createTemplate,
      async () => {
        if (templateForm.name.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '模板名称不能为空。' : 'Template name is required.'}`,
          )
        }
        if (
          templateForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          templateForm.fingerprintConfig.basicSettings.customPlatformName.trim().length === 0
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '自定义平台名称不能为空。' : 'Custom platform name is required.'}`,
          )
        }
        if (
          templateForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          templateForm.fingerprintConfig.basicSettings.customPlatformUrl.trim().length > 0 &&
          !/^https?:\/\//i.test(templateForm.fingerprintConfig.basicSettings.customPlatformUrl.trim())
        ) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '平台 URL 需以 http:// 或 https:// 开头。' : 'Platform URL must start with http:// or https://.'}`,
          )
        }
        const api = requireDesktopApi(['templates.create', 'templates.update'])
        const payload = {
          name: templateForm.name.trim(),
          proxyId: templateForm.proxyId || null,
          groupName: templateForm.groupName,
          tags: normalizeTags(templateForm.tagsText),
          notes: templateForm.notes,
          fingerprintConfig: {
            ...templateForm.fingerprintConfig,
            runtimeMetadata: {
              ...defaultFingerprint.runtimeMetadata,
              lastValidationMessages: [],
              injectedFeatures: [],
            },
            basicSettings: {
              ...templateForm.fingerprintConfig.basicSettings,
              customPlatformName:
                templateForm.fingerprintConfig.basicSettings.platform === 'custom'
                  ? templateForm.fingerprintConfig.basicSettings.customPlatformName.trim()
                  : '',
              customPlatformUrl:
                templateForm.fingerprintConfig.basicSettings.platform === 'custom'
                  ? templateForm.fingerprintConfig.basicSettings.customPlatformUrl.trim()
                  : '',
            },
            resolution: `${templateForm.fingerprintConfig.advanced.windowWidth}x${templateForm.fingerprintConfig.advanced.windowHeight}`,
          },
        }
        if (selectedTemplateId) {
          await api.templates.update({
            id: selectedTemplateId,
            ...payload,
          })
        } else {
          await api.templates.create(payload)
        }
        setSelectedTemplateId(null)
        setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
        setNoticeMessage(
          locale === 'zh-CN' ? '模板已保存，列表已刷新。' : 'Template saved and list refreshed.',
        )
      },
    )
  }

  async function saveProxy() {
    await withBusy(
      selectedProxyId ? t.busy.updateProxy : t.busy.createProxy,
      async () => {
        if (proxyForm.name.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理名称不能为空。' : 'Proxy name is required.'}`,
          )
        }
        if (proxyForm.host.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理主机不能为空。' : 'Proxy host is required.'}`,
          )
        }
        if (!Number.isFinite(Number(proxyForm.port)) || Number(proxyForm.port) <= 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理端口必须大于 0。' : 'Proxy port must be greater than 0.'}`,
          )
        }
        const api = requireDesktopApi(['proxies.create', 'proxies.update'])
        const payload = { ...proxyForm, port: Number(proxyForm.port) }
        if (selectedProxyId) {
          await api.proxies.update({ id: selectedProxyId, ...payload })
        } else {
          await api.proxies.create(payload)
        }
        setSelectedProxyId(null)
        setProxyForm(emptyProxy())
        setNoticeMessage(
          locale === 'zh-CN' ? '代理已保存，列表已刷新。' : 'Proxy saved and list refreshed.',
        )
      },
    )
  }

  async function saveSettings() {
    await withBusy(t.busy.saveSettings, async () => {
      const api = requireDesktopApi(['settings.set'])
      await api.settings.set(settings)
      setNoticeMessage(locale === 'zh-CN' ? '设置已保存。' : 'Settings saved.')
    })
  }

  async function saveCloudPhone() {
    await withBusy(
      selectedCloudPhoneId ? t.busy.updateCloudPhone : t.busy.createCloudPhone,
      async () => {
        if (cloudPhoneForm.name.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '云手机环境名称不能为空。' : 'Cloud phone name is required.'}`,
          )
        }
        if (cloudPhoneForm.proxyHost.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理主机不能为空。' : 'Proxy host is required.'}`,
          )
        }
        if (cloudPhoneForm.proxyPort <= 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理端口必须大于 0。' : 'Proxy port must be greater than 0.'}`,
          )
        }
        if (cloudPhoneForm.proxyUsername.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理账号不能为空。' : 'Proxy username is required.'}`,
          )
        }
        if (cloudPhoneForm.proxyPassword.trim().length === 0) {
          throw new Error(
            `VALIDATION:${locale === 'zh-CN' ? '代理密码不能为空。' : 'Proxy password is required.'}`,
          )
        }

        const api = requireDesktopApi(['cloudPhones.create', 'cloudPhones.update'])
        const payload = {
          ...cloudPhoneForm,
          name: cloudPhoneForm.name.trim(),
          groupName: cloudPhoneForm.groupName.trim(),
          tags: cloudPhoneForm.tags,
          notes: cloudPhoneForm.notes.trim(),
          providerKind: providerKindForKey(cloudPhoneForm.providerKey),
          providerConfig: buildProviderConfig(
            cloudPhoneForm.providerKey,
            settings,
            cloudPhoneForm.providerConfig,
          ),
          proxyHost: cloudPhoneForm.proxyHost.trim(),
          proxyUsername: cloudPhoneForm.proxyUsername.trim(),
        }

        if (selectedCloudPhoneId) {
          await api.cloudPhones.update({
            id: selectedCloudPhoneId,
            ...payload,
          })
        } else {
          await api.cloudPhones.create(payload)
        }
        setSelectedCloudPhoneId(null)
        setCloudPhonePageMode('list')
        setCloudPhoneDetails(null)
        setCloudPhoneForm(emptyCloudPhone(settings, defaultCloudPhoneProvider))
        setNoticeMessage(
          locale === 'zh-CN'
            ? '云手机环境已保存，列表已刷新。'
            : 'Cloud phone environment saved and list refreshed.',
        )
      },
    )
  }

  async function testCloudPhoneProxy() {
    await withBusy(t.busy.testCloudPhoneProxy, async () => {
      const api = requireDesktopApi(['cloudPhones.testProxy'])
      const result = await api.cloudPhones.testProxy(cloudPhoneForm)
      setNoticeMessage(result.message)
    })
  }

  async function runCloudPhoneBulkDelete() {
    if (selectedCloudPhoneIds.length === 0) {
      return
    }
    if (!window.confirm(t.common.confirmDeleteMany(selectedCloudPhoneIds.length))) {
      return
    }
    await withBusy(t.busy.bulkDeleteCloudPhones, async () => {
      const api = requireDesktopApi(['cloudPhones.bulkDelete'])
      await api.cloudPhones.bulkDelete({ cloudPhoneIds: selectedCloudPhoneIds })
      setSelectedCloudPhoneIds([])
      setNoticeMessage(
        locale === 'zh-CN'
          ? `已删除 ${selectedCloudPhoneIds.length} 个云手机环境。`
          : `Deleted ${selectedCloudPhoneIds.length} cloud phone environments.`,
      )
    })
  }

  async function runBulkDelete() {
    if (selectedProfileIds.length === 0) {
      return
    }
    if (!window.confirm(t.common.confirmDeleteMany(selectedProfileIds.length))) {
      return
    }
    await withBusy(t.busy.bulkDelete, async () => {
      const api = requireDesktopApi(['profiles.bulkDelete'])
      await api.profiles.bulkDelete({ profileIds: selectedProfileIds })
      setSelectedProfileIds([])
      setNoticeMessage(
        locale === 'zh-CN'
          ? `已删除 ${selectedProfileIds.length} 个环境。`
          : `Deleted ${selectedProfileIds.length} profiles.`,
      )
    })
  }

  function updateCloudPhoneProvider(providerKey: string) {
    setCloudPhoneForm((current) => ({
      ...current,
      providerKey,
      providerKind: providerKindForKey(providerKey),
      providerConfig: buildProviderConfig(providerKey, settings, current.providerConfig),
    }))
    setCloudPhoneDetails(null)
  }

  function renderProviderLabel(providerKey: string): string {
    if (locale === 'zh-CN') {
      if (providerKey === 'self-hosted') return t.cloudPhones.providerSelfHosted
      if (providerKey === 'third-party') return t.cloudPhones.providerThirdParty
      if (providerKey === 'local-emulator') return t.cloudPhones.providerLocalEmulator
      if (providerKey === 'mock') return t.cloudPhones.providerMock
    }
    const provider = cloudPhoneProviderMap.get(providerKey)
    return provider?.label ?? providerKey
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">B</div>
          <div>
            <strong>{t.appName}</strong>
            <span>{t.appTagline}</span>
          </div>
        </div>

        <nav className="nav">
          {views.map((item) => (
            <button
              key={item.key}
              className={item.key === view ? 'nav-item active' : 'nav-item'}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="sidebar-card">
          <h3>{t.settings.profiles}</h3>
          <p>{directoryInfo?.profilesDir ?? t.common.loading}</p>
        </section>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>{pageHeading.title}</h1>
            <p>{pageHeading.subtitle}</p>
          </div>
          <div className="status-pill">
            {busyMessage || t.common.runningSummary(summary.runningProfiles, summary.totalProfiles)}
          </div>
        </header>

        {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
        {!errorMessage && noticeMessage ? <div className="banner success">{noticeMessage}</div> : null}

        {view === 'dashboard' ? (
          <section className="panel-grid">
            <article className="metric-card">
              <span>{t.dashboard.profiles}</span>
              <strong>{summary.totalProfiles}</strong>
              <small>{t.common.activeNow(summary.runningProfiles)}</small>
            </article>
            <article className="metric-card">
              <span>{t.dashboard.proxies}</span>
              <strong>{summary.totalProxies}</strong>
              <small>
                {summary.onlineProxies} {t.common.healthy}
              </small>
            </article>
            <article className="metric-card">
              <span>{t.dashboard.templates}</span>
              <strong>{templates.length}</strong>
              <small>{t.profiles.fromTemplate}</small>
            </article>
            <article className="metric-card">
              <span>{t.cloudPhones.title}</span>
              <strong>{summary.totalCloudPhones}</strong>
              <small>{t.common.activeNow(summary.runningCloudPhones)}</small>
            </article>
            <article className="metric-card">
              <span>{t.cloudPhones.defaultProviderHealth}</span>
              <strong>
                {defaultCloudPhoneProviderHealth
                  ? defaultCloudPhoneProviderHealth.available
                    ? t.common.ready
                    : t.common.missing
                  : t.common.loading}
              </strong>
              <small>
                {defaultCloudPhoneProviderHealth?.message ?? renderProviderLabel(defaultCloudPhoneProvider)}
              </small>
            </article>
            <article className="metric-card">
              <span>{t.dashboard.chromium}</span>
              <strong>
                {directoryInfo?.chromiumExecutable ? t.common.ready : t.common.missing}
              </strong>
              <small>{directoryInfo?.chromiumExecutable ?? t.dashboard.installChromium}</small>
            </article>
            <section className="wide-card">
              <div className="section-title">
                <h2>{t.dashboard.recentLogs}</h2>
              </div>
              <div className="log-list">
                {logs.slice(0, 8).map((entry) => (
                  <div key={entry.id} className={`log-row ${entry.level}`}>
                    <span>{translateLogCategory(locale, entry.category)}</span>
                    <p>{entry.message}</p>
                    <time>{formatDate(entry.createdAt)}</time>
                  </div>
                ))}
                {logs.length === 0 ? <p className="empty">{t.dashboard.noLogs}</p> : null}
              </div>
            </section>
          </section>
        ) : null}

        {view === 'profiles' ? (
          <section
            className={
              resourceMode === 'templates' ? 'workspace workspace-wide' : 'workspace workspace-single'
            }
          >
            {showProfileWorkspaceList || showTemplateWorkspace ? (
            <div className="list-card">
              <div className="section-title">
                <h2>{t.profiles.title}</h2>
                <div className="section-title-actions">
                  <div className="chip-row">
                    <button
                      className={resourceMode === 'profiles' ? 'chip active' : 'chip'}
                      onClick={() => setResourceMode('profiles')}
                    >
                      {t.profiles.manageProfiles}
                    </button>
                    <button
                      className={resourceMode === 'templates' ? 'chip active' : 'chip'}
                      onClick={() => setResourceMode('templates')}
                    >
                      {t.profiles.manageTemplates}
                    </button>
                  </div>
                  {resourceMode === 'profiles' ? (
                    <button className="primary" onClick={openCreateProfilePage}>
                      {t.profiles.createProfile}
                    </button>
                  ) : null}
                </div>
              </div>

              {resourceMode === 'profiles' ? (
                <>
                  <div className="toolbar">
                    <input
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder={`${t.common.search}...`}
                    />
                    <select
                      value={statusFilter}
                      onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    >
                      <option value="all">{t.profiles.statusFilter}: {t.common.all}</option>
                      <option value="queued">{translateStatus(locale, 'queued')}</option>
                      <option value="starting">{translateStatus(locale, 'starting')}</option>
                      <option value="running">{translateStatus(locale, 'running')}</option>
                      <option value="idle">{translateStatus(locale, 'idle')}</option>
                      <option value="stopped">{translateStatus(locale, 'stopped')}</option>
                      <option value="error">{translateStatus(locale, 'error')}</option>
                    </select>
                    <select
                      value={groupFilter}
                      onChange={(event) => setGroupFilter(event.target.value)}
                    >
                      <option value="all">{t.profiles.groupFilter}: {t.common.all}</option>
                      {groupOptions.map((groupName) => (
                        <option key={groupName} value={groupName}>
                          {groupName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="batch-toolbar">
                    <span>{t.profiles.selectedCount(selectedProfileIds.length)}</span>
                    <button
                      className="secondary"
                      disabled={selectedProfileIds.length === 0}
                      onClick={() =>
                        void withBusy(t.busy.bulkStart, async () => {
                          const api = requireDesktopApi(['profiles.bulkStart'])
                          await api.profiles.bulkStart({
                            profileIds: selectedProfileIds,
                          })
                          setNoticeMessage(
                            locale === 'zh-CN'
                              ? `已将 ${selectedProfileIds.length} 个环境加入启动队列。`
                              : `Queued ${selectedProfileIds.length} profiles for launch.`,
                          )
                        })
                      }
                    >
                      {t.profiles.batchStart}
                    </button>
                    <button
                      className="secondary"
                      disabled={selectedProfileIds.length === 0}
                      onClick={() =>
                        void withBusy(t.busy.bulkStop, async () => {
                          const api = requireDesktopApi(['profiles.bulkStop'])
                          await api.profiles.bulkStop({
                            profileIds: selectedProfileIds,
                          })
                          setNoticeMessage(
                            locale === 'zh-CN'
                              ? `已停止 ${selectedProfileIds.length} 个环境。`
                              : `Stopped ${selectedProfileIds.length} profiles.`,
                          )
                        })
                      }
                    >
                      {t.profiles.batchStop}
                    </button>
                    <input
                      value={batchGroupName}
                      onChange={(event) => setBatchGroupName(event.target.value)}
                      placeholder={t.profiles.group}
                    />
                    <button
                      className="secondary"
                      disabled={selectedProfileIds.length === 0 || batchGroupName.trim().length === 0}
                      onClick={() =>
                        void withBusy(t.busy.bulkAssignGroup, async () => {
                          const api = requireDesktopApi(['profiles.bulkAssignGroup'])
                          await api.profiles.bulkAssignGroup({
                            profileIds: selectedProfileIds,
                            groupName: batchGroupName.trim(),
                          })
                          setBatchGroupName('')
                          setNoticeMessage(
                            locale === 'zh-CN'
                              ? '批量分组已更新。'
                              : 'Bulk group assignment updated.',
                          )
                        })
                      }
                    >
                      {t.profiles.batchAssignGroup}
                    </button>
                    <button
                      className="danger"
                      disabled={selectedProfileIds.length === 0}
                      onClick={() => void runBulkDelete()}
                    >
                      {t.profiles.batchDelete}
                    </button>
                  </div>

                  {Object.entries(groupedProfiles).map(([groupName, items]) => (
                    <div key={groupName} className="profile-group">
                      <h3>{groupName}</h3>
                      {items.map((profile) => (
                        <article key={profile.id} className="list-row list-row-compact">
                          <label className="check-cell">
                            <input
                              type="checkbox"
                              checked={selectedProfileIds.includes(profile.id)}
                              onChange={() => toggleProfileSelection(profile.id)}
                            />
                          </label>
                          <div className="list-main">
                            <strong>{profile.name}</strong>
                            <p>
                              {profile.tags.join(', ') || t.common.noTags}
                              {profile.fingerprintConfig.runtimeMetadata.lastResolvedIp
                                ? ` · IP ${profile.fingerprintConfig.runtimeMetadata.lastResolvedIp} · ${profile.fingerprintConfig.runtimeMetadata.lastResolvedCountry || profile.fingerprintConfig.runtimeMetadata.lastResolvedRegion || profile.fingerprintConfig.runtimeMetadata.lastResolvedTimezone}`
                                : ''}
                            </p>
                          </div>
                          <div className="list-meta">
                            <span className={`badge ${profile.status}`}>
                              {translateStatus(locale, profile.status)}
                            </span>
                            <button className="ghost" onClick={() => openEditProfilePage(profile.id)}>
                              {t.common.edit}
                            </button>
                            <button
                              className="ghost"
                              onClick={() =>
                                void withBusy(t.busy.cloneProfile, async () => {
                                  const api = requireDesktopApi(['profiles.clone'])
                                  await api.profiles.clone(profile.id)
                                  setNoticeMessage(
                                    locale === 'zh-CN' ? '环境已克隆。' : 'Profile cloned.',
                                  )
                                })
                              }
                            >
                              {t.common.clone}
                            </button>
                            {profile.status === 'running' || profile.status === 'starting' || profile.status === 'queued' ? (
                              <button
                                className="danger"
                                onClick={() =>
                                  void withBusy(t.busy.stopProfile, async () => {
                                    const api = requireDesktopApi(['runtime.stop'])
                                    await api.runtime.stop(profile.id)
                                    setNoticeMessage(
                                      locale === 'zh-CN' ? '环境已停止。' : 'Profile stopped.',
                                    )
                                  })
                                }
                              >
                                {t.common.stop}
                              </button>
                            ) : (
                              <button
                                className="primary"
                                onClick={() =>
                                  void withBusy(t.busy.launchProfile, async () => {
                                    const api = requireDesktopApi(['runtime.launch'])
                                    await api.runtime.launch(profile.id)
                                    setNoticeMessage(
                                      locale === 'zh-CN' ? '环境已加入启动队列。' : 'Profile queued for launch.',
                                    )
                                  })
                                }
                              >
                                {profile.status === 'error'
                                  ? (locale === 'zh-CN' ? '重试启动' : 'Retry launch')
                                  : t.common.launch}
                              </button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ))}

                  {filteredProfiles.length === 0 ? <p className="empty">{t.profiles.firstProfile}</p> : null}
                </>
              ) : (
                <>
                  <div className="section-note">{t.profiles.createFromTemplateHint}</div>
                  {templates.map((template) => (
                    <article key={template.id} className="list-row">
                      <div className="list-main">
                        <strong>{template.name}</strong>
                        <p>{template.tags.join(', ') || t.common.noTags}</p>
                      </div>
                      <div className="list-meta">
                        <button className="ghost" onClick={() => setSelectedTemplateId(template.id)}>
                          {t.common.edit}
                        </button>
                        <button
                          className="primary"
                          onClick={() => loadTemplateIntoProfile(template)}
                        >
                          {t.templates.createProfileFromTemplate}
                        </button>
                      </div>
                    </article>
                  ))}
                  {templates.length === 0 ? <p className="empty">{t.templates.empty}</p> : null}
                </>
              )}
            </div>
            ) : null}

            {showProfileWorkspaceEditor || showTemplateWorkspace ? (
            <div className={`editor-card ${showProfileWorkspaceEditor ? 'editor-page' : ''}`}>
              {resourceMode === 'profiles' ? (
                <>
                  <div className="section-title">
                    <div>
                      {showProfileWorkspaceEditor ? (
                        <button className="ghost page-back" onClick={returnToProfileList}>
                          {profileBackLabel}
                        </button>
                      ) : null}
                      <h2>{selectedProfileId ? t.profiles.editProfile : t.profiles.createProfile}</h2>
                    </div>
                    <div className="chip-row">
                      {selectedProfileId ? (
                        <>
                          <button
                            className="ghost"
                            onClick={() =>
                              void withBusy(t.busy.openProfileFolder, async () => {
                                const api = requireDesktopApi(['profiles.revealDirectory'])
                                await api.profiles.revealDirectory(selectedProfileId)
                              })
                            }
                          >
                            {t.profiles.revealFolder}
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              void withBusy(t.busy.createTemplateFromProfile, async () => {
                                const api = requireDesktopApi(['templates.createFromProfile'])
                                await api.templates.createFromProfile(selectedProfileId)
                                setNoticeMessage(
                                  locale === 'zh-CN'
                                    ? '已从当前环境生成模板。'
                                    : 'Template created from current profile.',
                                )
                              })
                            }
                          >
                            {t.profiles.saveAsTemplate}
                          </button>
                        </>
                      ) : null}
                      <button className="primary" onClick={() => void saveProfile()}>
                        {selectedProfileId ? t.profiles.updateProfile : t.profiles.createProfile}
                      </button>
                    </div>
                  </div>
                  {profileForm.fingerprintConfig.runtimeMetadata.lastValidationMessages.length > 0 ? (
                    <div
                      className={`section-note profile-validation-note ${profileForm.fingerprintConfig.runtimeMetadata.lastValidationLevel}`}
                    >
                      {profileForm.fingerprintConfig.runtimeMetadata.lastValidationMessages.join(' ')}
                    </div>
                  ) : null}
                  <div className="section-title section-title-sub">
                    <h2>{locale === 'zh-CN' ? '基础设置' : 'Basic settings'}</h2>
                  </div>
                  <label>
                    <span>{t.profiles.name}</span>
                    <input value={profileForm.name} maxLength={50} onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))} />
                  </label>
                  <label>
                    <span>{t.profiles.tags}</span>
                    <input value={profileForm.tagsText} onChange={(event) => setProfileForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder={t.profiles.tagsPlaceholder} />
                  </label>
                  <div className="split">
                    <label>
                      <span>{t.profiles.group}</span>
                      <input value={profileForm.groupName} onChange={(event) => setProfileForm((current) => ({ ...current, groupName: event.target.value }))} />
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '平台' : 'Platform'}</span>
                      <select
                        value={profileForm.fingerprintConfig.basicSettings.platform}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                platform: event.target.value,
                                customPlatformName:
                                  event.target.value === 'custom'
                                    ? current.fingerprintConfig.basicSettings.customPlatformName
                                    : '',
                                customPlatformUrl:
                                  event.target.value === 'custom'
                                    ? current.fingerprintConfig.basicSettings.customPlatformUrl
                                    : '',
                              },
                            },
                          }))
                        }
                      >
                        <option value="">{locale === 'zh-CN' ? '请选择' : 'Select'}</option>
                        <option value="amazon">Amazon</option>
                        <option value="tiktok">TikTok</option>
                        <option value="google">Google</option>
                        <option value="facebook">Facebook</option>
                        <option value="custom">{locale === 'zh-CN' ? '自定义平台' : 'Custom platform'}</option>
                      </select>
                    </label>
                  </div>
                  {profileForm.fingerprintConfig.basicSettings.platform === 'custom' ? (
                    <div className="split">
                      <label>
                        <span>{locale === 'zh-CN' ? '平台名称' : 'Platform name'}</span>
                        <input
                          value={profileForm.fingerprintConfig.basicSettings.customPlatformName}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              fingerprintConfig: {
                                ...current.fingerprintConfig,
                                basicSettings: {
                                  ...current.fingerprintConfig.basicSettings,
                                  customPlatformName: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '平台 URL' : 'Platform URL'}</span>
                        <input
                          value={profileForm.fingerprintConfig.basicSettings.customPlatformUrl}
                          onChange={(event) =>
                            setProfileForm((current) => ({
                              ...current,
                              fingerprintConfig: {
                                ...current.fingerprintConfig,
                                basicSettings: {
                                  ...current.fingerprintConfig.basicSettings,
                                  customPlatformUrl: event.target.value,
                                },
                              },
                            }))
                          }
                          placeholder="https://example.com"
                        />
                      </label>
                    </div>
                  ) : null}
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '用户名' : 'Username'}</span>
                      <input
                        value={profileForm.fingerprintConfig.basicSettings.platformUsername}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                platformUsername: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '密码' : 'Password'}</span>
                      <input
                        type="password"
                        value={profileForm.fingerprintConfig.basicSettings.platformPassword}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                platformPassword: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '多开设置' : 'Multi-open'}</span>
                      <select
                        value={profileForm.fingerprintConfig.basicSettings.multiOpenMode}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                multiOpenMode: event.target.value as 'allow' | 'deny',
                              },
                            },
                          }))
                        }
                      >
                        <option value="allow">{locale === 'zh-CN' ? '允许' : 'Allow'}</option>
                        <option value="deny">{locale === 'zh-CN' ? '不允许' : 'Deny'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '2FA 秘钥' : '2FA secret'}</span>
                      <input
                        value={profileForm.fingerprintConfig.basicSettings.twoFactorSecret}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              basicSettings: {
                                ...current.fingerprintConfig.basicSettings,
                                twoFactorSecret: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    <span>{locale === 'zh-CN' ? 'Cookie 初始化内容' : 'Cookie seed'}</span>
                    <textarea
                      rows={3}
                      value={profileForm.fingerprintConfig.basicSettings.cookieSeed}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            basicSettings: {
                              ...current.fingerprintConfig.basicSettings,
                              cookieSeed: event.target.value,
                            },
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.profiles.notes}</span>
                    <textarea rows={4} value={profileForm.notes} onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))} />
                  </label>

                  <div className="section-title section-title-sub">
                    <h2>{locale === 'zh-CN' ? '代理设置' : 'Proxy settings'}</h2>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '代理方式' : 'Proxy mode'}</span>
                      <select
                        value={profileForm.fingerprintConfig.proxySettings.proxyMode}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            proxyId: event.target.value === 'manager' ? current.proxyId : null,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              proxySettings: {
                                ...current.fingerprintConfig.proxySettings,
                                proxyMode: event.target.value as typeof current.fingerprintConfig.proxySettings.proxyMode,
                              },
                            },
                          }))
                        }
                      >
                        <option value="direct">{locale === 'zh-CN' ? '直接模式' : 'Direct'}</option>
                        <option value="custom">{locale === 'zh-CN' ? '自定义代理' : 'Custom proxy'}</option>
                        <option value="manager">{locale === 'zh-CN' ? '代理管理' : 'Proxy manager'}</option>
                        <option value="api">{locale === 'zh-CN' ? 'API 提取' : 'Provider API'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? 'IP 查询渠道' : 'IP lookup channel'}</span>
                      <input
                        value={profileForm.fingerprintConfig.proxySettings.ipLookupChannel}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              proxySettings: {
                                ...current.fingerprintConfig.proxySettings,
                                ipLookupChannel: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  </div>
                  {profileForm.fingerprintConfig.proxySettings.proxyMode === 'manager' ? (
                    <label>
                      <span>{t.profiles.proxy}</span>
                      <select
                        value={profileForm.proxyId ?? ''}
                        onChange={(event) => setProfileForm((current) => ({ ...current, proxyId: event.target.value || null }))}
                      >
                        <option value="">{t.common.noProxy}</option>
                        {proxies.map((proxy) => (
                          <option key={proxy.id} value={proxy.id}>{proxy.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {profileForm.fingerprintConfig.proxySettings.proxyMode === 'custom' ? (
                    <>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? '代理类型' : 'Proxy type'}</span>
                          <select
                            value={profileForm.fingerprintConfig.proxySettings.proxyType}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                fingerprintConfig: {
                                  ...current.fingerprintConfig,
                                  proxySettings: {
                                    ...current.fingerprintConfig.proxySettings,
                                    proxyType: event.target.value as ProxyType,
                                  },
                                },
                              }))
                            }
                          >
                            <option value="http">HTTP</option>
                            <option value="https">HTTPS</option>
                            <option value="socks5">SOCKS5</option>
                          </select>
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? 'IP 协议' : 'IP protocol'}</span>
                          <select
                            value={profileForm.fingerprintConfig.proxySettings.ipProtocol}
                            onChange={(event) =>
                              setProfileForm((current) => ({
                                ...current,
                                fingerprintConfig: {
                                  ...current.fingerprintConfig,
                                  proxySettings: {
                                    ...current.fingerprintConfig.proxySettings,
                                    ipProtocol: event.target.value as 'ipv4' | 'ipv6',
                                  },
                                },
                              }))
                            }
                          >
                            <option value="ipv4">IPv4</option>
                            <option value="ipv6">IPv6</option>
                          </select>
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? '主机' : 'Host'}</span>
                          <input value={profileForm.fingerprintConfig.proxySettings.host} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, proxySettings: { ...current.fingerprintConfig.proxySettings, host: event.target.value } } }))} />
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? '端口' : 'Port'}</span>
                          <input type="number" value={profileForm.fingerprintConfig.proxySettings.port || ''} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, proxySettings: { ...current.fingerprintConfig.proxySettings, port: Number(event.target.value) } } }))} />
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? '账号' : 'Username'}</span>
                          <input value={profileForm.fingerprintConfig.proxySettings.username} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, proxySettings: { ...current.fingerprintConfig.proxySettings, username: event.target.value } } }))} />
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? '密码' : 'Password'}</span>
                          <input type="password" value={profileForm.fingerprintConfig.proxySettings.password} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, proxySettings: { ...current.fingerprintConfig.proxySettings, password: event.target.value } } }))} />
                        </label>
                      </div>
                    </>
                  ) : null}

                  <div className="section-title section-title-sub">
                    <h2>{locale === 'zh-CN' ? '常用设置' : 'Common settings'}</h2>
                    <button className="ghost" onClick={() => setShowMoreProfileCommon((value) => !value)}>
                      {showMoreProfileCommon ? (locale === 'zh-CN' ? '收起' : 'Collapse') : (locale === 'zh-CN' ? '展示更多' : 'Show more')}
                    </button>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '浏览器窗口工作台页面' : 'Workspace page'}</span>
                      <select value={profileForm.fingerprintConfig.commonSettings.pageMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, pageMode: event.target.value as 'local' | 'hidden' } } }))}>
                        <option value="local">{locale === 'zh-CN' ? '本地页面' : 'Local page'}</option>
                        <option value="hidden">{locale === 'zh-CN' ? '不显示' : 'Hidden'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '禁止加载图片' : 'Block images'}</span>
                      <select value={profileForm.fingerprintConfig.commonSettings.blockImages ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, blockImages: event.target.value === 'true' } } }))}>
                        <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                        <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                      </select>
                    </label>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '同步标签页' : 'Sync tabs'}</span>
                      <select value={profileForm.fingerprintConfig.commonSettings.syncTabs ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, syncTabs: event.target.value === 'true' } } }))}>
                        <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '同步 Cookie' : 'Sync cookies'}</span>
                      <select value={profileForm.fingerprintConfig.commonSettings.syncCookies ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, syncCookies: event.target.value === 'true' } } }))}>
                        <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                      </select>
                    </label>
                  </div>
                  {showMoreProfileCommon ? (
                    <div className="split">
                      <label>
                        <span>{locale === 'zh-CN' ? '启动前清缓存' : 'Clear cache on launch'}</span>
                        <select value={profileForm.fingerprintConfig.commonSettings.clearCacheOnLaunch ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, clearCacheOnLaunch: event.target.value === 'true' } } }))}>
                          <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                          <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        </select>
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '启动随机指纹' : 'Randomize on launch'}</span>
                        <select value={profileForm.fingerprintConfig.commonSettings.randomizeFingerprintOnLaunch ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, randomizeFingerprintOnLaunch: event.target.value === 'true' } } }))}>
                          <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                          <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        </select>
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '允许登录 Chrome' : 'Allow Chrome login'}</span>
                        <select value={profileForm.fingerprintConfig.commonSettings.allowChromeLogin ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, allowChromeLogin: event.target.value === 'true' } } }))}>
                          <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                          <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                        </select>
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '硬件加速' : 'Hardware acceleration'}</span>
                        <select value={profileForm.fingerprintConfig.commonSettings.hardwareAcceleration ? 'true' : 'false'} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, commonSettings: { ...current.fingerprintConfig.commonSettings, hardwareAcceleration: event.target.value === 'true' } } }))}>
                          <option value="true">{locale === 'zh-CN' ? '开启' : 'On'}</option>
                          <option value="false">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                        </select>
                      </label>
                    </div>
                  ) : null}

                  <div className="section-title section-title-sub">
                    <h2>{locale === 'zh-CN' ? '指纹设置' : 'Fingerprint settings'}</h2>
                    <div className="chip-row">
                      <button className="secondary" onClick={() => setProfileForm((current) => ({ ...current, fingerprintConfig: randomDesktopFingerprint(current.fingerprintConfig) }))}>
                        {locale === 'zh-CN' ? '一键随机生成指纹配置' : 'Randomize fingerprint'}
                      </button>
                      <button className="ghost" onClick={() => setShowMoreProfileFingerprint((value) => !value)}>
                        {showMoreProfileFingerprint ? (locale === 'zh-CN' ? '收起' : 'Collapse') : (locale === 'zh-CN' ? '展示更多' : 'Show more')}
                      </button>
                    </div>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '浏览器' : 'Browser'}</span>
                      <select value={profileForm.fingerprintConfig.advanced.browserKernel} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, browserKernel: event.target.value as 'chrome' | 'system-default' } } }))}>
                        <option value="chrome">Google Chrome</option>
                        <option value="system-default">{locale === 'zh-CN' ? '当前系统默认浏览器' : 'System default browser'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '设备' : 'Device'}</span>
                      <select value={profileForm.fingerprintConfig.advanced.deviceMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, deviceMode: event.target.value as 'desktop' | 'android' | 'ios' } } }))}>
                        <option value="desktop">{locale === 'zh-CN' ? '桌面端' : 'Desktop'}</option>
                        <option value="android">Android</option>
                        <option value="ios">iOS</option>
                      </select>
                    </label>
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '操作系统' : 'Operating system'}</span>
                      <input value={profileForm.fingerprintConfig.advanced.operatingSystem} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, operatingSystem: event.target.value } } }))} />
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '浏览器版本' : 'Browser version'}</span>
                      <input value={profileForm.fingerprintConfig.advanced.browserVersion} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, browserVersion: event.target.value } } }))} />
                    </label>
                  </div>
                  <label>
                    <span>{t.profiles.userAgent}</span>
                    <textarea rows={3} value={profileForm.fingerprintConfig.userAgent} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, userAgent: event.target.value } }))} />
                  </label>
                  {profileForm.fingerprintConfig.runtimeMetadata.lastResolvedIp ? (
                    <div className="section-note">
                      {locale === 'zh-CN'
                        ? `最近联动结果：IP ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedIp} · ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedCountry || profileForm.fingerprintConfig.runtimeMetadata.lastResolvedRegion || '未知地区'} · 时区 ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedTimezone || '未生成'}`
                        : `Last resolved network profile: ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedIp} · ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedCountry || profileForm.fingerprintConfig.runtimeMetadata.lastResolvedRegion || 'Unknown region'} · ${profileForm.fingerprintConfig.runtimeMetadata.lastResolvedTimezone || 'No timezone'}`}
                    </div>
                  ) : null}
                  {profileForm.fingerprintConfig.runtimeMetadata.injectedFeatures.length > 0 ? (
                    <div className="section-note">
                      {locale === 'zh-CN'
                        ? `已接入运行时的高级指纹项：${profileForm.fingerprintConfig.runtimeMetadata.injectedFeatures.join('、')}`
                        : `Runtime-injected fingerprint features: ${profileForm.fingerprintConfig.runtimeMetadata.injectedFeatures.join(', ')}`}
                    </div>
                  ) : null}
                  <div className="split">
                    <label>
                      <span>{t.profiles.language}</span>
                      <select
                        value={profileForm.fingerprintConfig.advanced.autoLanguageFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoLanguageFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{locale === 'zh-CN' ? '基于 IP 自动生成语言' : 'Auto language from IP'}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置语言' : 'Manual language'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t.profiles.timezone}</span>
                      <select
                        value={profileForm.fingerprintConfig.advanced.autoTimezoneFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              timezone:
                                event.target.value === 'auto'
                                  ? ''
                                  : current.fingerprintConfig.timezone || 'America/Los_Angeles',
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoTimezoneFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{t.cloudPhones.autoTimezone}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置时区' : 'Manual timezone'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '地理位置' : 'Geolocation'}</span>
                      <select
                        value={profileForm.fingerprintConfig.advanced.autoGeolocationFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoGeolocationFromIp: event.target.value === 'auto',
                                geolocation:
                                  event.target.value === 'auto'
                                    ? ''
                                    : current.fingerprintConfig.advanced.geolocation,
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{locale === 'zh-CN' ? '基于 IP 自动生成地理位置' : 'Auto geolocation from IP'}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置地理位置' : 'Manual geolocation'}</option>
                      </select>
                    </label>
                  </div>
                  {!profileForm.fingerprintConfig.advanced.autoLanguageFromIp ? (
                    <label>
                      <span>{t.profiles.language}</span>
                      <select
                        value={normalizeEnvironmentLanguage(profileForm.fingerprintConfig.language, defaultEnvironmentLanguage)}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              language: event.target.value,
                            },
                          }))
                        }
                      >
                        {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                          <option key={code} value={code}>{t.common.envLanguageLabel(code)}</option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {!profileForm.fingerprintConfig.advanced.autoTimezoneFromIp ? (
                    <label>
                      <span>{t.profiles.timezone}</span>
                      <input
                        value={profileForm.fingerprintConfig.timezone}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              timezone: event.target.value,
                            },
                          }))
                        }
                        placeholder="America/Los_Angeles"
                      />
                    </label>
                  ) : null}
                  {!profileForm.fingerprintConfig.advanced.autoGeolocationFromIp ? (
                    <label>
                      <span>{locale === 'zh-CN' ? '地理位置' : 'Geolocation'}</span>
                      <input
                        value={profileForm.fingerprintConfig.advanced.geolocation}
                        onChange={(event) =>
                          setProfileForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                geolocation: event.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="34.0522, -118.2437"
                      />
                    </label>
                  ) : null}
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? '保存或启动前会优先根据代理出口 IP 联动生成时区、语言与地理位置；没有代理时回退到本机公网 IP。'
                      : 'Before save or launch, timezone, language, and geolocation are resolved from the proxy exit IP when available, otherwise from the local public IP.'}
                  </div>
                  <div className="split">
                    <label>
                      <span>{locale === 'zh-CN' ? '窗口尺寸' : 'Window size'}</span>
                      <input value={`${profileForm.fingerprintConfig.advanced.windowWidth} x ${profileForm.fingerprintConfig.advanced.windowHeight}`} onChange={(event) => {
                        const [widthText, heightText] = event.target.value.split(/x|×/i).map((item) => item.trim())
                        setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, windowWidth: Number(widthText) || current.fingerprintConfig.advanced.windowWidth, windowHeight: Number(heightText) || current.fingerprintConfig.advanced.windowHeight } } }))
                      }} />
                    </label>
                    <label>
                      <span>{t.profiles.webrtc}</span>
                      <select value={profileForm.fingerprintConfig.webrtcMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, webrtcMode: event.target.value as FingerprintConfig['webrtcMode'] } }))}>
                        <option value="default">{locale === 'zh-CN' ? '默认' : 'Default'}</option>
                        <option value="disabled">{locale === 'zh-CN' ? '禁用' : 'Disabled'}</option>
                      </select>
                    </label>
                  </div>
                  {showMoreProfileFingerprint ? (
                    <>
                      <div className="split">
                        <label>
                          <span>Canvas</span>
                          <select value={profileForm.fingerprintConfig.advanced.canvasMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, canvasMode: event.target.value as typeof current.fingerprintConfig.advanced.canvasMode } } }))}>
                            <option value="random">{locale === 'zh-CN' ? '随机' : 'Random'}</option>
                            <option value="off">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                            <option value="custom">{locale === 'zh-CN' ? '自定义' : 'Custom'}</option>
                          </select>
                        </label>
                        <label>
                          <span>WebGL</span>
                          <select value={profileForm.fingerprintConfig.advanced.webglImageMode} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, webglImageMode: event.target.value as typeof current.fingerprintConfig.advanced.webglImageMode } } }))}>
                            <option value="random">{locale === 'zh-CN' ? '随机' : 'Random'}</option>
                            <option value="off">{locale === 'zh-CN' ? '关闭' : 'Off'}</option>
                            <option value="custom">{locale === 'zh-CN' ? '自定义' : 'Custom'}</option>
                          </select>
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? '设备名称' : 'Device name'}</span>
                          <input value={profileForm.fingerprintConfig.advanced.deviceName} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, deviceName: event.target.value } } }))} />
                        </label>
                        <label>
                          <span>Host IP</span>
                          <input value={profileForm.fingerprintConfig.advanced.hostIp} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, hostIp: event.target.value } } }))} />
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>MAC</span>
                          <input value={profileForm.fingerprintConfig.advanced.macAddress} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, macAddress: event.target.value } } }))} />
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? '启动参数' : 'Launch args'}</span>
                          <input value={profileForm.fingerprintConfig.advanced.launchArgs} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, launchArgs: event.target.value } } }))} placeholder="--mute-audio,--disable-extensions" />
                        </label>
                      </div>
                      <div className="split">
                        <label>
                          <span>{locale === 'zh-CN' ? 'CPU 核数' : 'CPU cores'}</span>
                          <input type="number" value={profileForm.fingerprintConfig.advanced.cpuCores} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, cpuCores: Number(event.target.value) || current.fingerprintConfig.advanced.cpuCores } } }))} />
                        </label>
                        <label>
                          <span>{locale === 'zh-CN' ? '设备内存 (GB)' : 'Memory (GB)'}</span>
                          <input type="number" value={profileForm.fingerprintConfig.advanced.memoryGb} onChange={(event) => setProfileForm((current) => ({ ...current, fingerprintConfig: { ...current.fingerprintConfig, advanced: { ...current.fingerprintConfig.advanced, memoryGb: Number(event.target.value) || current.fingerprintConfig.advanced.memoryGb } } }))} />
                        </label>
                      </div>
                    </>
                  ) : null}
                  <div className="actions">
                    <button className="primary" onClick={() => void saveProfile()}>
                      {selectedProfileId ? t.profiles.updateProfile : t.profiles.createProfile}
                    </button>
                    {selectedProfileId ? (
                      <button
                        className="danger"
                        onClick={() =>
                          void withBusy(t.busy.deleteProfile, async () => {
                            const api = requireDesktopApi(['profiles.delete'])
                            await api.profiles.delete(selectedProfileId)
                            setSelectedProfileId(null)
                            setProfilePageMode('list')
                            setProfileForm(
                              emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage),
                            )
                            setNoticeMessage(
                              locale === 'zh-CN' ? '环境已删除。' : 'Profile deleted.',
                            )
                          })
                        }
                      >
                        {t.profiles.deleteProfile}
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className="section-title">
                    <h2>{selectedTemplateId ? t.templates.editTemplate : t.templates.createTemplate}</h2>
                    <button
                      className="secondary"
                      onClick={() => {
                        setSelectedTemplateId(null)
                        setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
                      }}
                    >
                      {t.templates.newTemplate}
                    </button>
                  </div>
                  <label>
                    <span>{t.profiles.name}</span>
                    <input
                      value={templateForm.name}
                      onChange={(event) =>
                        setTemplateForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.profiles.group}</span>
                    <input
                      value={templateForm.groupName}
                      onChange={(event) =>
                        setTemplateForm((current) => ({ ...current, groupName: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.profiles.tags}</span>
                    <input
                      value={templateForm.tagsText}
                      onChange={(event) =>
                        setTemplateForm((current) => ({ ...current, tagsText: event.target.value }))
                      }
                      placeholder={t.profiles.tagsPlaceholder}
                    />
                  </label>
                  <label>
                    <span>{locale === 'zh-CN' ? '平台' : 'Platform'}</span>
                    <select
                      value={templateForm.fingerprintConfig.basicSettings.platform}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            basicSettings: {
                              ...current.fingerprintConfig.basicSettings,
                              platform: event.target.value,
                              customPlatformName:
                                event.target.value === 'custom'
                                  ? current.fingerprintConfig.basicSettings.customPlatformName
                                  : '',
                              customPlatformUrl:
                                event.target.value === 'custom'
                                  ? current.fingerprintConfig.basicSettings.customPlatformUrl
                                  : '',
                            },
                          },
                        }))
                      }
                    >
                      <option value="">{locale === 'zh-CN' ? '请选择' : 'Select'}</option>
                      <option value="amazon">Amazon</option>
                      <option value="tiktok">TikTok</option>
                      <option value="google">Google</option>
                      <option value="facebook">Facebook</option>
                      <option value="custom">{locale === 'zh-CN' ? '自定义平台' : 'Custom platform'}</option>
                    </select>
                  </label>
                  {templateForm.fingerprintConfig.basicSettings.platform === 'custom' ? (
                    <div className="split">
                      <label>
                        <span>{locale === 'zh-CN' ? '平台名称' : 'Platform name'}</span>
                        <input
                          value={templateForm.fingerprintConfig.basicSettings.customPlatformName}
                          onChange={(event) =>
                            setTemplateForm((current) => ({
                              ...current,
                              fingerprintConfig: {
                                ...current.fingerprintConfig,
                                basicSettings: {
                                  ...current.fingerprintConfig.basicSettings,
                                  customPlatformName: event.target.value,
                                },
                              },
                            }))
                          }
                        />
                      </label>
                      <label>
                        <span>{locale === 'zh-CN' ? '平台 URL' : 'Platform URL'}</span>
                        <input
                          value={templateForm.fingerprintConfig.basicSettings.customPlatformUrl}
                          onChange={(event) =>
                            setTemplateForm((current) => ({
                              ...current,
                              fingerprintConfig: {
                                ...current.fingerprintConfig,
                                basicSettings: {
                                  ...current.fingerprintConfig.basicSettings,
                                  customPlatformUrl: event.target.value,
                                },
                              },
                            }))
                          }
                          placeholder="https://example.com"
                        />
                      </label>
                    </div>
                  ) : null}
                  <label>
                    <span>{t.profiles.proxy}</span>
                    <select
                      value={templateForm.proxyId ?? ''}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          proxyId: event.target.value || null,
                        }))
                      }
                    >
                      <option value="">{t.common.noProxy}</option>
                      {proxies.map((proxy) => (
                        <option key={proxy.id} value={proxy.id}>
                          {proxy.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="split">
                    <label>
                      <span>{t.profiles.language}</span>
                      <select
                        value={templateForm.fingerprintConfig.advanced.autoLanguageFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoLanguageFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{locale === 'zh-CN' ? '基于 IP 自动生成语言' : 'Auto language from IP'}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置语言' : 'Manual language'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t.profiles.timezone}</span>
                      <select
                        value={templateForm.fingerprintConfig.advanced.autoTimezoneFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              timezone:
                                event.target.value === 'auto'
                                  ? ''
                                  : current.fingerprintConfig.timezone || 'America/Los_Angeles',
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoTimezoneFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{t.cloudPhones.autoTimezone}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置时区' : 'Manual timezone'}</option>
                      </select>
                    </label>
                    <label>
                      <span>{locale === 'zh-CN' ? '地理位置' : 'Geolocation'}</span>
                      <select
                        value={templateForm.fingerprintConfig.advanced.autoGeolocationFromIp ? 'auto' : 'manual'}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                autoGeolocationFromIp: event.target.value === 'auto',
                              },
                            },
                          }))
                        }
                      >
                        <option value="auto">{locale === 'zh-CN' ? '基于 IP 自动生成地理位置' : 'Auto geolocation from IP'}</option>
                        <option value="manual">{locale === 'zh-CN' ? '手动设置地理位置' : 'Manual geolocation'}</option>
                      </select>
                    </label>
                  </div>
                  {!templateForm.fingerprintConfig.advanced.autoLanguageFromIp ? (
                    <label>
                      <span>{t.profiles.language}</span>
                      <select
                        value={normalizeEnvironmentLanguage(templateForm.fingerprintConfig.language)}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              language: event.target.value,
                            },
                          }))
                        }
                      >
                        {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                          <option key={code} value={code}>
                            {t.common.envLanguageLabel(code)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {!templateForm.fingerprintConfig.advanced.autoTimezoneFromIp ? (
                    <label>
                      <span>{t.profiles.timezone}</span>
                      <input
                        value={templateForm.fingerprintConfig.timezone}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              timezone: event.target.value,
                            },
                          }))
                        }
                        placeholder="America/Los_Angeles"
                      />
                    </label>
                  ) : null}
                  {!templateForm.fingerprintConfig.advanced.autoGeolocationFromIp ? (
                    <label>
                      <span>{locale === 'zh-CN' ? '地理位置' : 'Geolocation'}</span>
                      <input
                        value={templateForm.fingerprintConfig.advanced.geolocation}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              advanced: {
                                ...current.fingerprintConfig.advanced,
                                geolocation: event.target.value,
                              },
                            },
                          }))
                        }
                        placeholder="34.0522, -118.2437"
                      />
                    </label>
                  ) : null}
                  <div className="section-note">
                    {locale === 'zh-CN'
                      ? '从该模板创建环境时，会根据代理出口 IP 或本机公网 IP 自动联动生成时区、语言与地理位置。'
                      : 'Profiles created from this template will auto-resolve timezone, language, and geolocation from the proxy exit IP or local public IP.'}
                  </div>
                  <div className="split">
                    <label>
                      <span>{t.profiles.resolution}</span>
                      <input
                        value={templateForm.fingerprintConfig.resolution}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              resolution: event.target.value,
                            },
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>{t.profiles.webrtc}</span>
                      <select
                        value={templateForm.fingerprintConfig.webrtcMode}
                        onChange={(event) =>
                          setTemplateForm((current) => ({
                            ...current,
                            fingerprintConfig: {
                              ...current.fingerprintConfig,
                              webrtcMode: event.target.value as FingerprintConfig['webrtcMode'],
                            },
                          }))
                        }
                      >
                        <option value="default">Default</option>
                        <option value="disabled">Disabled</option>
                      </select>
                    </label>
                  </div>
                  <label>
                    <span>{t.profiles.userAgent}</span>
                    <textarea
                      rows={3}
                      value={templateForm.fingerprintConfig.userAgent}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            userAgent: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.profiles.notes}</span>
                    <textarea
                      rows={4}
                      value={templateForm.notes}
                      onChange={(event) =>
                        setTemplateForm((current) => ({ ...current, notes: event.target.value }))
                      }
                    />
                  </label>
                  <div className="actions">
                    <button className="primary" onClick={() => void saveTemplate()}>
                      {selectedTemplateId ? t.templates.updateTemplate : t.templates.createTemplate}
                    </button>
                    {selectedTemplateId ? (
                      <button
                        className="danger"
                        onClick={() =>
                          void withBusy(t.busy.deleteTemplate, async () => {
                            const api = requireDesktopApi(['templates.delete'])
                            await api.templates.delete(selectedTemplateId)
                            setSelectedTemplateId(null)
                            setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
                            setNoticeMessage(
                              locale === 'zh-CN' ? '模板已删除。' : 'Template deleted.',
                            )
                          })
                        }
                      >
                        {t.templates.deleteTemplate}
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </div>
            ) : null}
          </section>
        ) : null}

        {view === 'cloudPhones' ? (
          <section className="workspace workspace-single">
            {showCloudPhoneList ? (
            <div className="list-card">
              <div className="section-title">
                <h2>{t.cloudPhones.title}</h2>
                <div className="section-title-actions">
                  <button
                    className="secondary"
                    onClick={() =>
                      void withBusy(t.busy.refreshCloudPhones, async () => {
                        const api = requireDesktopApi(['cloudPhones.refreshStatuses'])
                        await api.cloudPhones.refreshStatuses()
                        setNoticeMessage(
                          locale === 'zh-CN' ? '云手机状态已刷新。' : 'Cloud phone statuses refreshed.',
                        )
                      })
                    }
                  >
                    {t.cloudPhones.refreshStatuses}
                  </button>
                  <button className="primary" onClick={openCreateCloudPhonePage}>
                    {t.cloudPhones.create}
                  </button>
                </div>
              </div>
              <div className="toolbar">
                <input
                  value={cloudPhoneSearchQuery}
                  onChange={(event) => setCloudPhoneSearchQuery(event.target.value)}
                  placeholder={`${t.common.search}...`}
                />
                <select
                  value={cloudPhoneGroupFilter}
                  onChange={(event) => setCloudPhoneGroupFilter(event.target.value)}
                >
                  <option value="all">{t.profiles.groupFilter}: {t.common.all}</option>
                  {cloudPhoneGroupOptions.map((groupName) => (
                    <option key={groupName} value={groupName}>
                      {groupName}
                    </option>
                  ))}
                </select>
                <div className="section-note">{t.cloudPhones.subtitle}</div>
              </div>
              {defaultCloudPhoneProviderHealth ? (
                <div
                  className={`cloud-phone-provider-strip ${
                    defaultCloudPhoneProviderHealth.available ? 'healthy' : 'warning'
                  }`}
                >
                  <strong>
                    {t.cloudPhones.defaultProvider}: {renderProviderLabel(defaultCloudPhoneProvider)}
                  </strong>
                  <span>
                    {defaultCloudPhoneProviderHealth.available ? t.common.ready : t.common.missing}
                  </span>
                  <p>{defaultCloudPhoneProviderHealth.message}</p>
                </div>
              ) : null}
              <div className="batch-toolbar">
                <span>{t.cloudPhones.selectedCount(selectedCloudPhoneIds.length)}</span>
                <button
                  className="secondary"
                  disabled={selectedCloudPhoneIds.length === 0}
                  onClick={() =>
                    void withBusy(t.busy.bulkStartCloudPhones, async () => {
                      const api = requireDesktopApi(['cloudPhones.bulkStart'])
                      await api.cloudPhones.bulkStart({ cloudPhoneIds: selectedCloudPhoneIds })
                      setNoticeMessage(
                        locale === 'zh-CN'
                          ? `已启动 ${selectedCloudPhoneIds.length} 个云手机环境。`
                          : `Started ${selectedCloudPhoneIds.length} cloud phone environments.`,
                      )
                    })
                  }
                >
                  {t.cloudPhones.batchStart}
                </button>
                <button
                  className="secondary"
                  disabled={selectedCloudPhoneIds.length === 0}
                  onClick={() =>
                    void withBusy(t.busy.bulkStopCloudPhones, async () => {
                      const api = requireDesktopApi(['cloudPhones.bulkStop'])
                      await api.cloudPhones.bulkStop({ cloudPhoneIds: selectedCloudPhoneIds })
                      setNoticeMessage(
                        locale === 'zh-CN'
                          ? `已停止 ${selectedCloudPhoneIds.length} 个云手机环境。`
                          : `Stopped ${selectedCloudPhoneIds.length} cloud phone environments.`,
                      )
                    })
                  }
                >
                  {t.cloudPhones.batchStop}
                </button>
                <input
                  value={cloudPhoneBatchGroupName}
                  onChange={(event) => setCloudPhoneBatchGroupName(event.target.value)}
                  placeholder={t.profiles.group}
                />
                <button
                  className="secondary"
                  disabled={
                    selectedCloudPhoneIds.length === 0 || cloudPhoneBatchGroupName.trim().length === 0
                  }
                  onClick={() =>
                    void withBusy(t.busy.bulkAssignCloudPhoneGroup, async () => {
                      const api = requireDesktopApi(['cloudPhones.bulkAssignGroup'])
                      await api.cloudPhones.bulkAssignGroup({
                        cloudPhoneIds: selectedCloudPhoneIds,
                        groupName: cloudPhoneBatchGroupName.trim(),
                      })
                      setCloudPhoneBatchGroupName('')
                      setNoticeMessage(
                        locale === 'zh-CN'
                          ? '云手机分组已更新。'
                          : 'Cloud phone group assignment updated.',
                      )
                    })
                  }
                >
                  {t.cloudPhones.batchAssignGroup}
                </button>
                <button
                  className="danger"
                  disabled={selectedCloudPhoneIds.length === 0}
                  onClick={() => void runCloudPhoneBulkDelete()}
                >
                  {t.cloudPhones.batchDelete}
                </button>
              </div>
              {Object.entries(groupedCloudPhones).map(([groupName, items]) => (
                <div key={groupName} className="profile-group">
                  <h3>{groupName}</h3>
                  {items.map((item) => (
                    <article key={item.id} className="list-row list-row-compact">
                      <label className="check-cell">
                        <input
                          type="checkbox"
                          checked={selectedCloudPhoneIds.includes(item.id)}
                          onChange={() => toggleCloudPhoneSelection(item.id)}
                        />
                      </label>
                      <div className="list-main">
                        <strong>{item.name}</strong>
                        <p>
                          {t.cloudPhones.provider}: {renderProviderLabel(item.providerKey)} · {t.cloudPhones.computeType}:{' '}
                          {item.computeType}
                        </p>
                      </div>
                      <div className="list-meta">
                        <span className={`badge ${item.status === 'running' ? 'running' : item.status === 'error' ? 'error' : 'stopped'}`}>
                          {t.cloudPhones.statusLabel(item.status)}
                        </span>
                        <button className="ghost" onClick={() => openEditCloudPhonePage(item.id)}>
                          {t.common.edit}
                        </button>
                        <button
                          className="ghost"
                          onClick={() =>
                            void withBusy(t.busy.refreshCloudPhones, async () => {
                              const api = requireDesktopApi(['cloudPhones.getDetails'])
                              const details = await api.cloudPhones.getDetails(item.id)
                              setCloudPhoneDetails(details)
                              setNoticeMessage(details.message)
                            })
                          }
                        >
                          {t.cloudPhones.details}
                        </button>
                        {item.status === 'running' || item.status === 'starting' ? (
                          <button
                            className="danger"
                            onClick={() =>
                              void withBusy(t.busy.stopCloudPhone, async () => {
                                const api = requireDesktopApi(['cloudPhones.stop'])
                                await api.cloudPhones.stop(item.id)
                                setNoticeMessage(
                                  locale === 'zh-CN' ? '云手机环境已停止。' : 'Cloud phone stopped.',
                                )
                              })
                            }
                          >
                            {t.common.stop}
                          </button>
                        ) : (
                          <button
                            className="primary"
                            onClick={() =>
                              void withBusy(t.busy.startCloudPhone, async () => {
                                const api = requireDesktopApi(['cloudPhones.start'])
                                await api.cloudPhones.start(item.id)
                                setNoticeMessage(
                                  locale === 'zh-CN' ? '云手机环境已启动。' : 'Cloud phone started.',
                                )
                              })
                            }
                          >
                            {t.common.launch}
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ))}
              {filteredCloudPhones.length === 0 ? <p className="empty">{t.cloudPhones.empty}</p> : null}
            </div>
            ) : null}

            {showCloudPhoneEditor ? (
            <div className="editor-card editor-page">
              <div className="section-title">
                <div>
                  <button className="ghost page-back" onClick={returnToCloudPhoneList}>
                    {cloudPhoneBackLabel}
                  </button>
                  <h2>{selectedCloudPhoneId ? t.cloudPhones.edit : t.cloudPhones.create}</h2>
                </div>
                <button className="primary" onClick={() => void saveCloudPhone()}>
                  {selectedCloudPhoneId ? t.busy.updateCloudPhone : t.cloudPhones.create}
                </button>
              </div>
              <div className="section-title section-title-sub">
                <h2>{t.cloudPhones.providerSettings}</h2>
              </div>
              <label>
                <span>{t.cloudPhones.provider}</span>
                <select
                  value={cloudPhoneForm.providerKey}
                  onChange={(event) => updateCloudPhoneProvider(event.target.value)}
                >
                  {cloudPhoneProviders.map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              {cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey) ? (
                <div
                  className={`cloud-phone-provider-strip ${
                    cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey)?.available
                      ? 'healthy'
                      : 'warning'
                  }`}
                >
                  <strong>{renderProviderLabel(cloudPhoneForm.providerKey)}</strong>
                  <span>
                    {cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey)?.available
                      ? t.common.ready
                      : t.common.missing}
                  </span>
                  <p>{cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey)?.message}</p>
                </div>
              ) : null}
              <div className="section-title section-title-sub">
                <h2>{t.cloudPhones.computeType}</h2>
              </div>
              <label>
                <span>{t.cloudPhones.computeType}</span>
                <select
                  value={cloudPhoneForm.computeType}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      computeType: event.target.value as CloudPhoneFormState['computeType'],
                    }))
                  }
                >
                  <option value="basic">{t.cloudPhones.computeBasic}</option>
                  <option value="standard">{t.cloudPhones.computeStandard}</option>
                  <option value="pro">{t.cloudPhones.computePro}</option>
                </select>
              </label>

              <div className="section-title section-title-sub">
                <h2>{t.profiles.title}</h2>
              </div>
              <label>
                <span>{t.profiles.name}</span>
                <input
                  value={cloudPhoneForm.name}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>{t.profiles.tags}</span>
                <input
                  value={cloudPhoneForm.tags.join(', ')}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      tags: normalizeTags(event.target.value),
                    }))
                  }
                  placeholder={t.profiles.tagsPlaceholder}
                />
              </label>
              <label>
                <span>{t.profiles.group}</span>
                <input
                  value={cloudPhoneForm.groupName}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({ ...current, groupName: event.target.value }))
                  }
                />
              </label>
              <label>
                <span>{t.profiles.notes}</span>
                <textarea
                  rows={3}
                  value={cloudPhoneForm.notes}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>

              <div className="section-title section-title-sub">
                <h2>{t.proxies.title}</h2>
              </div>
              {cloudPhoneForm.providerKey === 'self-hosted' ? (
                <div className="split">
                  <label>
                    <span>{t.cloudPhones.baseUrl}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.baseUrl ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            baseUrl: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.cloudPhones.clusterId}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.clusterId ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            clusterId: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {cloudPhoneForm.providerKey === 'third-party' ? (
                <div className="split">
                  <label>
                    <span>{t.cloudPhones.vendorKey}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.vendorKey ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            vendorKey: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    <span>{t.cloudPhones.baseUrl}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.baseUrl ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            baseUrl: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              ) : null}
              {cloudPhoneForm.providerKey === 'local-emulator' ? (
                <>
                  <label>
                    <span>{t.cloudPhones.localDevice}</span>
                    <select
                      value={cloudPhoneForm.providerConfig.adbSerial ?? ''}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            adbSerial: event.target.value,
                            emulatorName:
                              localEmulatorDevices.find((item) => item.serial === event.target.value)?.name ??
                              event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">{t.common.loading}</option>
                      {localEmulatorDevices.map((device) => (
                        <option key={device.serial} value={device.serial}>
                          {device.name} ({device.state})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{t.cloudPhones.adbPath}</span>
                    <input
                      value={cloudPhoneForm.providerConfig.adbPath ?? settings.localEmulatorAdbPath ?? 'adb'}
                      onChange={(event) =>
                        setCloudPhoneForm((current) => ({
                          ...current,
                          providerConfig: {
                            ...current.providerConfig,
                            adbPath: event.target.value,
                          },
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}
              <label>
                <span>{t.cloudPhones.ipLookupChannel}</span>
                <input
                  value={cloudPhoneForm.ipLookupChannel}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      ipLookupChannel: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="split">
                <label>
                  <span>{t.cloudPhones.proxyType}</span>
                  <select
                    value={cloudPhoneForm.proxyType}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        proxyType: event.target.value as CloudPhoneFormState['proxyType'],
                      }))
                    }
                  >
                    <option value="socks5">SOCKS5</option>
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </label>
                <label>
                  <span>{t.cloudPhones.ipProtocol}</span>
                  <select
                    value={cloudPhoneForm.ipProtocol}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        ipProtocol: event.target.value as CloudPhoneFormState['ipProtocol'],
                      }))
                    }
                  >
                    <option value="ipv4">{t.cloudPhones.protocolIpv4}</option>
                    <option value="ipv6">{t.cloudPhones.protocolIpv6}</option>
                  </select>
                </label>
              </div>
              <label>
                <span>{t.cloudPhones.proxyHost}</span>
                <input
                  value={cloudPhoneForm.proxyHost}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({ ...current, proxyHost: event.target.value }))
                  }
                />
              </label>
              <div className="split">
                <label>
                  <span>{t.cloudPhones.proxyPort}</span>
                  <input
                    type="number"
                    value={cloudPhoneForm.proxyPort || ''}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        proxyPort: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.cloudPhones.udpEnabled}</span>
                  <select
                    value={cloudPhoneForm.udpEnabled ? 'true' : 'false'}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        udpEnabled: event.target.value === 'true',
                      }))
                    }
                  >
                    <option value="true">{t.common.ready}</option>
                    <option value="false">{t.common.missing}</option>
                  </select>
                </label>
              </div>
              <div className="split">
                <label>
                  <span>{t.cloudPhones.proxyUsername}</span>
                  <input
                    value={cloudPhoneForm.proxyUsername}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        proxyUsername: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.cloudPhones.proxyPassword}</span>
                  <input
                    type="password"
                    value={cloudPhoneForm.proxyPassword}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        proxyPassword: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <button className="secondary" onClick={() => void testCloudPhoneProxy()}>
                {t.cloudPhones.testProxy}
              </button>

              <div className="section-title section-title-sub">
                <h2>{t.cloudPhones.fingerprint}</h2>
              </div>
              <label>
                <span>{t.profiles.language}</span>
                <select
                  value={cloudPhoneForm.fingerprintSettings.autoLanguage ? 'auto' : 'manual'}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      fingerprintSettings: {
                        ...current.fingerprintSettings,
                        autoLanguage: event.target.value === 'auto',
                        language:
                          event.target.value === 'auto'
                            ? null
                            : current.fingerprintSettings.language ?? defaultEnvironmentLanguage,
                      },
                    }))
                  }
                >
                  <option value="auto">{t.cloudPhones.autoLanguage}</option>
                  <option value="manual">{t.common.edit}</option>
                </select>
              </label>
              {!cloudPhoneForm.fingerprintSettings.autoLanguage ? (
                <label>
                  <span>{t.profiles.language}</span>
                  <select
                    value={cloudPhoneForm.fingerprintSettings.language ?? defaultEnvironmentLanguage}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        fingerprintSettings: {
                          ...current.fingerprintSettings,
                          language: event.target.value,
                        },
                      }))
                    }
                  >
                    {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {t.common.envLanguageLabel(code)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                <span>{t.profiles.timezone}</span>
                <select
                  value={cloudPhoneForm.fingerprintSettings.autoTimezone ? 'auto' : 'manual'}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      fingerprintSettings: {
                        ...current.fingerprintSettings,
                        autoTimezone: event.target.value === 'auto',
                        timezone:
                          event.target.value === 'auto'
                            ? null
                            : current.fingerprintSettings.timezone ?? 'Asia/Shanghai',
                      },
                    }))
                  }
                >
                  <option value="auto">{t.cloudPhones.autoTimezone}</option>
                  <option value="manual">{t.common.edit}</option>
                </select>
              </label>
              {!cloudPhoneForm.fingerprintSettings.autoTimezone ? (
                <label>
                  <span>{t.profiles.timezone}</span>
                  <input
                    value={cloudPhoneForm.fingerprintSettings.timezone ?? ''}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        fingerprintSettings: {
                          ...current.fingerprintSettings,
                          timezone: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ) : null}
              <label>
                <span>{t.cloudPhones.geolocation}</span>
                <select
                  value={cloudPhoneForm.fingerprintSettings.autoGeolocation ? 'auto' : 'manual'}
                  onChange={(event) =>
                    setCloudPhoneForm((current) => ({
                      ...current,
                      fingerprintSettings: {
                        ...current.fingerprintSettings,
                        autoGeolocation: event.target.value === 'auto',
                        geolocation:
                          event.target.value === 'auto'
                            ? null
                            : current.fingerprintSettings.geolocation ?? '',
                      },
                    }))
                  }
                >
                  <option value="auto">{t.cloudPhones.autoGeolocation}</option>
                  <option value="manual">{t.common.edit}</option>
                </select>
              </label>
              {!cloudPhoneForm.fingerprintSettings.autoGeolocation ? (
                <label>
                  <span>{t.cloudPhones.geolocation}</span>
                  <input
                    value={cloudPhoneForm.fingerprintSettings.geolocation ?? ''}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        fingerprintSettings: {
                          ...current.fingerprintSettings,
                          geolocation: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
              ) : null}

              {cloudPhoneDetails ? (
                <div className="import-summary">
                  <strong>{t.cloudPhones.details}</strong>
                  <p>{cloudPhoneDetails.message}</p>
                  <p>{cloudPhoneDetails.endpointUrl ?? t.common.missing}</p>
                  <p>{cloudPhoneDetails.connectionLabel ?? t.common.missing}</p>
                </div>
              ) : null}

              <div className="actions">
                {selectedCloudPhoneId ? (
                  <button
                    className="danger"
                    onClick={() =>
                      void withBusy(t.busy.deleteCloudPhone, async () => {
                        const api = requireDesktopApi(['cloudPhones.delete'])
                        await api.cloudPhones.delete(selectedCloudPhoneId)
                        setSelectedCloudPhoneId(null)
                        setCloudPhonePageMode('list')
                        setCloudPhoneDetails(null)
                        setCloudPhoneForm(emptyCloudPhone(settings, defaultCloudPhoneProvider))
                        setNoticeMessage(
                          locale === 'zh-CN'
                            ? '云手机环境已删除。'
                            : 'Cloud phone environment deleted.',
                        )
                      })
                    }
                  >
                    {t.common.delete}
                  </button>
                ) : null}
              </div>
            </div>
            ) : null}
          </section>
        ) : null}

        {view === 'proxies' ? (
          <section className="workspace">
            <div className="list-card">
              <div className="section-title">
                <h2>{t.proxies.title}</h2>
                <button
                  className="secondary"
                  onClick={() => {
                    setSelectedProxyId(null)
                    setProxyForm(emptyProxy())
                  }}
                >
                  {t.proxies.newProxy}
                </button>
              </div>

              {proxies.map((proxy) => (
                <article key={proxy.id} className="list-row">
                  <div className="list-main">
                    <strong>{proxy.name}</strong>
                    <p>
                      {proxy.type.toUpperCase()} {proxy.host}:{proxy.port}
                    </p>
                  </div>
                  <div className="list-meta">
                    <span className={`badge ${proxy.status}`}>
                      {translateStatus(locale, proxy.status)}
                    </span>
                    <button className="ghost" onClick={() => setSelectedProxyId(proxy.id)}>
                      {t.common.edit}
                    </button>
                    <button
                      className="primary"
                      onClick={() =>
                        void withBusy(t.busy.testProxy, async () => {
                          const api = requireDesktopApi(['proxies.test'])
                          await api.proxies.test(proxy.id)
                          setNoticeMessage(
                            locale === 'zh-CN' ? '代理测试已完成。' : 'Proxy test finished.',
                          )
                        })
                      }
                    >
                      {t.common.test}
                    </button>
                  </div>
                </article>
              ))}
              {proxies.length === 0 ? <p className="empty">{t.proxies.empty}</p> : null}
            </div>

            <div className="editor-card">
              <div className="section-title">
                <h2>{selectedProxyId ? t.proxies.editProxy : t.proxies.createProxy}</h2>
              </div>
              <label>
                <span>{t.proxies.name}</span>
                <input
                  value={proxyForm.name}
                  onChange={(event) =>
                    setProxyForm((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <div className="split">
                <label>
                  <span>{t.proxies.type}</span>
                  <select
                    value={proxyForm.type}
                    onChange={(event) =>
                      setProxyForm((current) => ({
                        ...current,
                        type: event.target.value as ProxyRecord['type'],
                      }))
                    }
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                </label>
                <label>
                  <span>{t.proxies.port}</span>
                  <input
                    type="number"
                    value={proxyForm.port}
                    onChange={(event) =>
                      setProxyForm((current) => ({
                        ...current,
                        port: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                <span>{t.proxies.host}</span>
                <input
                  value={proxyForm.host}
                  onChange={(event) =>
                    setProxyForm((current) => ({ ...current, host: event.target.value }))
                  }
                />
              </label>
              <div className="split">
                <label>
                  <span>{t.proxies.username}</span>
                  <input
                    value={proxyForm.username}
                    onChange={(event) =>
                      setProxyForm((current) => ({ ...current, username: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span>{t.proxies.password}</span>
                  <input
                    type="password"
                    value={proxyForm.password}
                    onChange={(event) =>
                      setProxyForm((current) => ({ ...current, password: event.target.value }))
                    }
                  />
                </label>
              </div>
              <div className="actions">
                <button className="primary" onClick={() => void saveProxy()}>
                  {selectedProxyId ? t.proxies.updateProxy : t.proxies.createProxy}
                </button>
                {selectedProxyId ? (
                  <button
                    className="danger"
                    onClick={() =>
                      void withBusy(t.busy.deleteProxy, async () => {
                        const api = requireDesktopApi(['proxies.delete'])
                        await api.proxies.delete(selectedProxyId)
                        setSelectedProxyId(null)
                        setProxyForm(emptyProxy())
                        setNoticeMessage(
                          locale === 'zh-CN' ? '代理已删除。' : 'Proxy deleted.',
                        )
                      })
                    }
                  >
                    {t.proxies.deleteProxy}
                  </button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {view === 'logs' ? (
          <section className="panel-single">
            <div className="section-title">
              <h2>{t.logs.title}</h2>
              <button
                className="secondary"
                onClick={() =>
                  void withBusy(t.busy.clearLogs, async () => {
                    const api = requireDesktopApi(['logs.clear'])
                    await api.logs.clear()
                    setNoticeMessage(locale === 'zh-CN' ? '日志已清空。' : 'Logs cleared.')
                  })
                }
              >
                {t.logs.clear}
              </button>
            </div>
            <div className="log-list">
              {logs.map((entry) => (
                <div key={entry.id} className={`log-row ${entry.level}`}>
                  <span>{translateLogLevel(locale, entry.level)}</span>
                  <p>{entry.message}</p>
                  <time>{formatDate(entry.createdAt)}</time>
                </div>
              ))}
              {logs.length === 0 ? <p className="empty">{t.logs.empty}</p> : null}
            </div>
          </section>
        ) : null}

        {view === 'settings' ? (
          <section className="workspace">
            <div className="editor-card">
              <div className="section-title">
                <h2>{t.settings.title}</h2>
              </div>
              <label>
                <span>{t.settings.language}</span>
                <select
                  value={settings.uiLanguage ?? 'zh-CN'}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      uiLanguage: event.target.value,
                    }))
                  }
                >
                  <option value="zh-CN">{t.settings.languageZh}</option>
                  <option value="en-US">{t.settings.languageEn}</option>
                </select>
              </label>
              <label>
                <span>{t.settings.defaultEnvironmentLanguage}</span>
                <select
                  value={defaultEnvironmentLanguage}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      defaultEnvironmentLanguage: event.target.value,
                    }))
                  }
                >
                  {SUPPORTED_ENVIRONMENT_LANGUAGES.map((code) => (
                    <option key={code} value={code}>
                      {t.common.envLanguageLabel(code)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t.settings.workspaceName}</span>
                <input
                  value={settings.workspaceName ?? ''}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      workspaceName: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>{t.settings.defaultHomePage}</span>
                <input
                  value={settings.defaultHomePage ?? ''}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      defaultHomePage: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                <span>{t.settings.notes}</span>
                <textarea
                  rows={5}
                  value={settings.notes ?? ''}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="split">
                <label>
                  <span>{t.settings.runtimeMaxConcurrentStarts}</span>
                  <input
                    type="number"
                    min={1}
                    value={settings.runtimeMaxConcurrentStarts ?? '2'}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        runtimeMaxConcurrentStarts: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.runtimeMaxActiveProfiles}</span>
                  <input
                    type="number"
                    min={1}
                    value={settings.runtimeMaxActiveProfiles ?? '6'}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        runtimeMaxActiveProfiles: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.runtimeMaxLaunchRetries}</span>
                  <input
                    type="number"
                    min={0}
                    value={settings.runtimeMaxLaunchRetries ?? '2'}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        runtimeMaxLaunchRetries: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="section-title section-title-sub">
                <h2>{t.settings.cloudPhoneProviders}</h2>
              </div>
              <label>
                <span>{t.settings.defaultCloudPhoneProvider}</span>
                <select
                  value={defaultCloudPhoneProvider}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      defaultCloudPhoneProvider: event.target.value,
                    }))
                  }
                >
                  {cloudPhoneProviders.map((provider) => (
                    <option key={provider.key} value={provider.key}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="split">
                <label>
                  <span>{t.settings.selfHostedBaseUrl}</span>
                  <input
                    value={settings.selfHostedCloudPhoneBaseUrl ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        selfHostedCloudPhoneBaseUrl: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.selfHostedApiKey}</span>
                  <input
                    type="password"
                    value={settings.selfHostedCloudPhoneApiKey ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        selfHostedCloudPhoneApiKey: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="split">
                <label>
                  <span>{t.settings.selfHostedClusterId}</span>
                  <input
                    value={settings.selfHostedCloudPhoneClusterId ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        selfHostedCloudPhoneClusterId: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.thirdPartyVendor}</span>
                  <input
                    value={settings.thirdPartyCloudPhoneVendor ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        thirdPartyCloudPhoneVendor: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="split">
                <label>
                  <span>{t.settings.thirdPartyBaseUrl}</span>
                  <input
                    value={settings.thirdPartyCloudPhoneBaseUrl ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        thirdPartyCloudPhoneBaseUrl: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span>{t.settings.thirdPartyToken}</span>
                  <input
                    type="password"
                    value={settings.thirdPartyCloudPhoneToken ?? ''}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        thirdPartyCloudPhoneToken: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                <span>{t.settings.localEmulatorAdbPath}</span>
                <input
                  value={settings.localEmulatorAdbPath ?? 'adb'}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      localEmulatorAdbPath: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="import-summary">
                <strong>{t.settings.providerHealth}</strong>
                  <ul className="warning-list">
                    {cloudPhoneProviderHealth.map((provider) => (
                      <li key={provider.key}>
                        {renderProviderLabel(provider.key)}: {provider.available ? t.common.ready : t.common.missing} ·{' '}
                        {provider.message}
                      </li>
                    ))}
                </ul>
              </div>
              {localEmulatorDevices.length > 0 ? (
                <div className="import-summary">
                  <strong>{t.settings.localDevices}</strong>
                  <ul className="warning-list">
                    {localEmulatorDevices.map((device) => (
                      <li key={device.serial}>
                        {device.name} ({device.serial}) · {device.state}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="actions">
                <button className="primary" onClick={() => void saveSettings()}>
                  {t.settings.save}
                </button>
              </div>
            </div>

            <div className="list-card">
              <div className="section-title">
                <h2>{t.settings.dataTools}</h2>
              </div>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() =>
                    void withBusy(t.busy.exportBundle, async () => {
                      const api = requireDesktopApi(['data.exportBundle'])
                      await api.data.exportBundle()
                      setNoticeMessage(
                        locale === 'zh-CN' ? '配置包已导出。' : 'Configuration bundle exported.',
                      )
                    })
                  }
                >
                  {t.settings.exportBundle}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void withBusy(t.busy.importBundle, async () => {
                      const api = requireDesktopApi(['data.importBundle'])
                      const result = await api.data.importBundle()
                      setImportResult(result)
                      if (result) {
                        setNoticeMessage(
                          locale === 'zh-CN'
                            ? '配置包已导入，数据已刷新。'
                            : 'Configuration bundle imported and data refreshed.',
                        )
                      }
                    })
                  }
                >
                  {t.settings.importBundle}
                </button>
              </div>

              {importResult ? (
                <div className="import-summary">
                  <strong>{t.settings.importResult}</strong>
                  <p>{t.common.importSummary(importResult)}</p>
                  {importResult.warnings.length > 0 ? (
                    <ul className="warning-list">
                      {importResult.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <div className="section-title section-title-sub">
                <h2>{t.settings.runtimePaths}</h2>
              </div>
              <dl className="details-list">
                <div>
                  <dt>{t.settings.appData}</dt>
                  <dd>{directoryInfo?.appDataDir ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.profiles}</dt>
                  <dd>{directoryInfo?.profilesDir ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.chromiumBinary}</dt>
                  <dd>{directoryInfo?.chromiumExecutable ?? t.settings.missingChromium}</dd>
                </div>
              </dl>

              <div className="section-title section-title-sub">
                <h2>{t.settings.runtimeInfo}</h2>
              </div>
              <dl className="details-list">
                <div>
                  <dt>{t.settings.runtimeMode}</dt>
                  <dd>{runtimeInfo?.mode ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.mainVersion}</dt>
                  <dd>{runtimeInfo?.mainVersion ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.preloadVersion}</dt>
                  <dd>{runtimeInfo?.preloadVersion ?? t.common.loading}</dd>
                </div>
                <div>
                  <dt>{t.settings.rendererVersion}</dt>
                  <dd>{runtimeInfo?.rendererVersion ?? __APP_VERSION__}</dd>
                </div>
                <div>
                  <dt>{t.settings.capabilities}</dt>
                  <dd>{runtimeInfo?.capabilities.join(', ') ?? t.common.loading}</dd>
                </div>
              </dl>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

export default App
