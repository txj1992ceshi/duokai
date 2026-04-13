import { useCallback, useEffect, useRef, useState } from 'react'
import { Toaster } from '@duokai/ui'
import './App.css'
import {
  dictionaries,
  getLocaleFromSettings,
  type LocaleCode,
} from './i18n'
import {
  useAccountWorkspace,
} from './hooks/useAccountWorkspace'
import { useCloudPhoneActions } from './hooks/useCloudPhoneActions'
import { useDesktopAppActions } from './hooks/useDesktopAppActions'
import { useDesktopAppData } from './hooks/useDesktopAppData'
import { useDesktopDerivedState } from './hooks/useDesktopDerivedState'
import { useDesktopFeedback } from './hooks/useDesktopFeedback'
import { useDesktopBridge } from './hooks/useDesktopBridge'
import { useDesktopNavigation } from './hooks/useDesktopNavigation'
import { useDesktopWorkspaceViewProps } from './hooks/useDesktopWorkspaceViewProps'
import i18nClient from './lib/i18n-client'
import {
  buildProviderConfig,
  emptyCloudPhone,
  providerKindForKey,
} from './lib/desktop-cloud-phones'
import {
  cloneFingerprintConfig,
  defaultFingerprint,
  detectRendererOperatingSystem,
  emptyProfile,
  emptyTemplate,
  getEnvironmentPurposeLabel,
  getEnvironmentPurposeSummary,
  isBlankProfileForm,
  normalizeFingerprintForSave,
  normalizeTags,
  summarizeHardwareSignature,
  summarizeIdentitySignature,
  summarizeLocaleSignature,
} from './lib/desktop-profile-presets'
import { useCloudPhonesWorkspace } from './hooks/useCloudPhonesWorkspace'
import { useProfileActions } from './hooks/useProfileActions'
import { useProfilesWorkspace } from './hooks/useProfilesWorkspace'
import { useProxyActions } from './hooks/useProxyActions'
import { useProxiesWorkspace } from './hooks/useProxiesWorkspace'
import { DesktopAuthView } from './components/DesktopAuthView'
import { DesktopWorkspaceViews, type DesktopWorkspaceViewKey } from './components/DesktopWorkspaceViews'
import { MainLayout, type MainNavKey } from './layouts/MainLayout'
import type {
  AuthUser,
  ImportResult,
  ProxyType,
  SettingsPayload,
} from './shared/types'
import { normalizeEnvironmentLanguage } from './shared/environmentLanguages'

type PendingLaunchState = Record<string, number>

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

function App() {
  const [view, setView] = useState<DesktopWorkspaceViewKey>('dashboard')
  const [mainSection, setMainSection] = useState<MainNavKey>('environmentCenter')
  const [settings, setSettings] = useState<SettingsPayload>({})
  const [pendingProfileLaunches, setPendingProfileLaunches] = useState<PendingLaunchState>({})
  const [busyMessage, setBusyMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [syncWarningMessage, setSyncWarningMessage] = useState('')
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [authIdentifier, setAuthIdentifier] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authRememberCredentials, setAuthRememberCredentials] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [uiLocaleOverride, setUiLocaleOverride] = useState<LocaleCode | null>(null)
  const lastUpdateNoticeKeyRef = useRef('')

  const locale = uiLocaleOverride ?? getLocaleFromSettings(settings.uiLanguage)
  const t = dictionaries[locale]
  const desktopT = i18nClient.getFixedT(locale, 'desktop')
  const rendererOperatingSystem = detectRendererOperatingSystem()
  const defaultEnvironmentLanguage = normalizeEnvironmentLanguage(
    settings.defaultEnvironmentLanguage,
  )
  const defaultCloudPhoneProvider = settings.defaultCloudPhoneProvider || 'self-hosted'
  const themeMode = settings.themeMode || 'system'
  const { localizeError, requireDesktopApi } = useDesktopBridge(locale)

  useEffect(() => {
    if (!uiLocaleOverride) {
      return
    }
    const persistedLocale = getLocaleFromSettings(settings.uiLanguage)
    if (persistedLocale === uiLocaleOverride) {
      setUiLocaleOverride(null)
    }
  }, [settings.uiLanguage, uiLocaleOverride])

  const handleUiLanguageChange = useCallback((nextLanguage: LocaleCode) => {
    setUiLocaleOverride(nextLanguage)
    let nextSettings: SettingsPayload = {}
    setSettings((current) => {
      nextSettings = {
        ...current,
        uiLanguage: nextLanguage,
      }
      return nextSettings
    })
    queueMicrotask(() => {
      void (async () => {
        try {
          const api = requireDesktopApi(['settings.set'])
          const persisted = await api.settings.set(nextSettings)
          setSettings(persisted)
        } catch (error) {
          setErrorMessage(localizeError(error))
        }
      })()
    })
  }, [localizeError, requireDesktopApi])

  const handleThemeModeChange = useCallback((nextThemeMode: 'light' | 'dark' | 'system') => {
    setSettings((current) => ({
      ...current,
      themeMode: nextThemeMode,
    }))
    queueMicrotask(() => {
      void (async () => {
        try {
          const api = requireDesktopApi(['settings.set'])
          const persisted = await api.settings.set({ themeMode: nextThemeMode })
          setSettings(persisted)
        } catch (error) {
          setErrorMessage(localizeError(error))
        }
      })()
    })
  }, [localizeError, requireDesktopApi])

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const applyTheme = () => {
      const useDark = themeMode === 'dark' || (themeMode === 'system' && media.matches)
      root.classList.toggle('dark', useDark)
    }

    applyTheme()
    media.addEventListener('change', applyTheme)
    return () => {
      media.removeEventListener('change', applyTheme)
    }
  }, [themeMode])

  const {
    summary,
    cloudPhones,
    cloudPhoneProviders,
    cloudPhoneProviderHealth,
    localEmulatorDevices,
    profiles,
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
  } = useDesktopAppData({
    requireDesktopApi,
    localizeError,
    currentView: view,
    rendererVersion: __APP_VERSION__,
    setErrorMessage,
    setSyncWarningMessage,
    setSettings,
  })

  useEffect(() => {
    if (!authState) {
      return
    }
    setAuthRememberCredentials(Boolean(authState.rememberCredentials))
    setAuthIdentifier(authState.rememberedIdentifier || '')
    setAuthPassword(authState.rememberedPassword || '')
  }, [authState])

  const {
    defaultCloudPhoneProviderHealth,
    latestNetworkCheck,
    agentReadOnlyMessage,
    cloudPhoneProviderHealthMap,
    runtimeRunningIds,
    runtimeQueuedIds,
    runtimeStartingIds,
    getProfileVisualState,
    getProfileStatusTone,
    getLaunchPhaseLabel,
    getEnvironmentSyncSummary,
    getRuntimeArtifactSyncSummaries,
    formatDate,
    describeUpdateStatus,
    getUpdateActionLabel,
    renderProviderLabel,
  } = useDesktopDerivedState({
    locale,
    t,
    rendererOperatingSystem,
    defaultCloudPhoneProvider,
    profiles,
    cloudPhoneProviders,
    cloudPhoneProviderHealth,
    agentState,
    runtimeHostInfo,
    runtimeStatus,
    pendingProfileLaunches,
  })

  const {
    selectedProxyId,
    proxyPanelOpen,
    proxyPanelMode,
    testingProxyId,
    setTestingProxyId,
    proxyRowFeedback,
    setProxyRowFeedback,
    proxyForm,
    setProxyForm,
    openCreateProxyPanel,
    openEditProxyPanel,
    closeProxyPanel,
    resetProxyWorkspace,
  } = useProxiesWorkspace({
    proxies,
    emptyProxy,
  })

  const {
    selectedCloudPhoneId,
    selectedCloudPhoneIds,
    setSelectedCloudPhoneIds,
    cloudPhoneSheetTab,
    setCloudPhoneSheetTab,
    cloudPhoneForm,
    setCloudPhoneForm,
    cloudPhoneSearchQuery,
    setCloudPhoneSearchQuery,
    cloudPhoneGroupFilter,
    setCloudPhoneGroupFilter,
    cloudPhoneBatchGroupName,
    setCloudPhoneBatchGroupName,
    cloudPhoneDetails,
    setCloudPhoneDetails,
    showCloudPhoneEditor,
    cloudPhoneGroupOptions,
    filteredCloudPhones,
    groupedCloudPhones,
    toggleCloudPhoneSelection,
    openCreateCloudPhonePage,
    openEditCloudPhonePage,
    returnToCloudPhoneList,
    updateCloudPhoneProvider,
    updateCloudPhoneProxyRefMode,
  } = useCloudPhonesWorkspace({
    cloudPhones,
    proxies,
    settings,
    t,
    defaultCloudPhoneProvider,
    emptyCloudPhone,
    buildProviderConfig,
    providerKindForKey,
    ensureCloudPhonesView: () => {
      setMainSection('environmentCenter')
      setView('cloudPhones')
    },
  })

  const {
    resourceMode,
    setResourceMode,
    selectedProfileId,
    setProfilePageMode,
    selectedTemplateId,
    templateDrawerOpen,
    setTemplateDrawerOpen,
    selectedProfileIds,
    setSelectedProfileIds,
    profileDrawerTab,
    setProfileDrawerTab,
    profileForm,
    setProfileForm,
    templateForm,
    setTemplateForm,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    groupFilter,
    setGroupFilter,
    batchGroupName,
    setBatchGroupName,
    showProfileWorkspaceEditor,
    groupOptions,
    groupedEnvironmentItems,
    toggleProfileSelection,
    openCreateProfilePage,
    openEditProfilePage,
    returnToProfileList,
    loadTemplateIntoProfile,
    openCreateTemplateDrawer,
    openEditTemplateDrawer,
    closeTemplateDrawer,
  } = useProfilesWorkspace({
    profiles,
    templates,
    proxies,
    locale,
    t,
    defaultEnvironmentLanguage,
    ensureProfilesView: () => {
      setMainSection('environmentCenter')
      setView('profiles')
    },
    emptyProfile,
    emptyTemplate,
    cloneFingerprintConfig,
    defaultRuntimeMetadata: defaultFingerprint.runtimeMetadata,
    isBlankProfileForm,
    getProfileVisualState,
    getProfileStatusTone,
    getEnvironmentPurposeLabel,
    getRuntimeArtifactSyncSummaries,
    summarizeIdentitySignature,
    summarizeLocaleSignature,
    summarizeHardwareSignature,
    getLaunchPhaseLabel,
    getEnvironmentSyncSummary,
  })

  const currentAuthUser: AuthUser | null = authState?.user ?? null
  const currentDeviceId = authState?.currentDeviceId || ''
  const {
    accountProfileForm,
    setAccountProfileForm,
    accountPasswordForm,
    setAccountPasswordForm,
    resetAccountPasswordForm,
  } = useAccountWorkspace({
    currentAuthUser,
  })
  const {
    environmentCenterTabs,
    pageHeading,
    breadcrumbItems,
    mainNav,
    secondaryNav,
    shellCopy,
  } = useDesktopNavigation({
    locale,
    mainSection,
    setMainSection,
    view,
    setView,
    updateState,
    setResourceMode,
    setProfilePageMode,
  })

  const sidebarActions = [
    {
      key: 'syncProfiles' as const,
      label: desktopT('navigation.actions.uploadProfiles'),
      onClick: () => void syncProfiles(),
    },
    {
      key: 'pullProfiles' as const,
      label: desktopT('navigation.actions.pullProfiles'),
      onClick: () => void pullProfiles(),
    },
    {
      key: 'syncGlobalConfig' as const,
      label: desktopT('navigation.actions.uploadGlobalConfig'),
      onClick: () => void syncGlobalConfig(),
    },
    {
      key: 'pullGlobalConfig' as const,
      label: desktopT('navigation.actions.pullGlobalConfig'),
      onClick: () => void pullGlobalConfig(),
    },
  ]

  const {
    checkForUpdates,
    openReleasePage,
    handlePrimaryUpdateAction,
    saveSettings,
    handleDesktopLogin,
    handleDesktopLogout,
    saveAccountProfile,
    saveAccountPassword,
    uploadAccountAvatar,
    syncProfiles,
    pullProfiles,
    syncGlobalConfig,
    pullGlobalConfig,
    revokeAccountDevice,
    deleteAccountDevice,
  } = useDesktopAppActions({
    locale,
    t,
    settings,
    authIdentifier,
    authPassword,
    authRememberCredentials,
    setAuthSubmitting,
    setAuthPassword,
    accountProfileForm,
    accountPasswordForm,
    resetAccountPasswordForm,
    currentDeviceId,
    requireDesktopApi,
    localizeError,
    setErrorMessage,
    setNoticeMessage,
    setSyncWarningMessage,
    setAuthState,
    setUpdateState,
    refreshAll,
    withBusy,
    clearAuthenticatedWorkspace,
    onCurrentDeviceSessionEnded: () => {
      setView('dashboard')
    },
  })

  const { saveProxy, testProxy, deleteSelectedProxy } = useProxyActions({
    locale,
    t,
    proxyForm,
    selectedProxyId,
    closeProxyPanel,
    requireDesktopApi,
    localizeError,
    setErrorMessage,
    setNoticeMessage,
    setTestingProxyId,
    setProxyRowFeedback,
    refreshAll,
    withBusy,
  })

  const {
    bulkStartCloudPhones,
    bulkStopCloudPhones,
    bulkAssignCloudPhoneGroup,
    loadCloudPhoneDetails,
    stopCloudPhone,
    startCloudPhone,
    saveCloudPhone,
    deleteSelectedCloudPhone,
    testCloudPhoneProxy,
    deleteCloudPhoneBulkSelection,
  } = useCloudPhoneActions({
    locale,
    t,
    settings,
    proxies,
    cloudPhoneForm,
    selectedCloudPhoneId,
    selectedCloudPhoneIds,
    setSelectedCloudPhoneIds,
    cloudPhoneBatchGroupName,
    setCloudPhoneBatchGroupName,
    setCloudPhoneDetails,
    setCloudPhoneForm,
    defaultCloudPhoneProvider,
    emptyCloudPhone,
    buildProviderConfig,
    providerKindForKey,
    returnToCloudPhoneList,
    requireDesktopApi,
    setNoticeMessage,
    withBusy,
  })

  const {
    saveProfile,
    saveTemplate,
    deleteSelectedProfile,
    launchProfile,
    stopProfile,
    syncProfileConfig,
    pullProfileConfig,
    syncProfileStorageState,
    pullProfileStorageState,
    moveProfileToNurture,
    moveProfileToOperation,
    deleteSelectedTemplate,
    bulkDeleteProfiles,
    bulkStartProfiles,
    bulkStopProfiles,
    bulkAssignGroupToProfiles,
    cloneProfile,
    revealSelectedProfileFolder,
    createTemplateFromSelectedProfile,
  } = useProfileActions({
    locale,
    t,
    profiles,
    proxies,
    defaultEnvironmentLanguage,
    defaultRuntimeMetadata: defaultFingerprint.runtimeMetadata,
    profileForm,
    setProfileForm,
    selectedProfileId,
    selectedProfileIds,
    setSelectedProfileIds,
    batchGroupName,
    setBatchGroupName,
    templateForm,
    setTemplateForm,
    selectedTemplateId,
    setPendingProfileLaunches,
    emptyProfile,
    emptyTemplate,
    normalizeTags,
    normalizeFingerprintForSave,
    getEnvironmentPurposeLabel,
    requireDesktopApi,
    localizeError,
    setErrorMessage,
    setNoticeMessage,
    refreshAll,
    withBusy,
    returnToProfileList,
    closeTemplateDrawer,
  })

  useDesktopFeedback({
    locale,
    errorMessage,
    noticeMessage,
    busyMessage,
    setNoticeMessage,
    updateState,
    lastUpdateNoticeKeyRef,
    profiles,
    runtimeQueuedIds,
    runtimeRunningIds,
    runtimeStartingIds,
    setPendingProfileLaunches,
    view,
    setTemplateDrawerOpen,
    resetProxyWorkspace,
  })

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

  const {
    shellProps,
    dashboardViewProps,
    profilesViewProps,
    cloudPhonesViewProps,
    proxiesViewProps,
    logsViewProps,
    settingsViewProps,
    accountViewProps,
  } = useDesktopWorkspaceViewProps({
    locale,
    t,
    view,
    mainSection,
    setMainSection,
    setView,
    environmentCenterTabs,
    errorMessage,
    syncWarningMessage,
    agentReadOnlyMessage,
    updateState,
    describeUpdateStatus,
    getUpdateActionLabel,
    handlePrimaryUpdateAction,
    openReleasePage,
    summary,
    templates,
    defaultCloudPhoneProvider,
    defaultCloudPhoneProviderHealth,
    directoryInfo,
    runtimeHostInfo,
    runtimeStatus,
    latestNetworkCheck,
    logs,
    renderProviderLabel,
    formatDate,
    resourceMode,
    setResourceMode,
    setTemplateDrawerOpen,
    setProfilePageMode,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    groupFilter,
    setGroupFilter,
    groupOptions,
    selectedProfileIds,
    batchGroupName,
    setBatchGroupName,
    groupedEnvironmentItems,
    toggleProfileSelection,
    openCreateProfilePage,
    openEditProfilePage,
    cloneProfile,
    launchProfile,
    stopProfile,
    syncProfileConfig,
    pullProfileConfig,
    syncProfileStorageState,
    pullProfileStorageState,
    moveProfileToNurture,
    moveProfileToOperation,
    bulkStartProfiles,
    bulkStopProfiles,
    bulkAssignGroupToProfiles,
    bulkDeleteProfiles,
    showProfileWorkspaceEditor,
    selectedProfileId,
    profileDrawerTab,
    setProfileDrawerTab,
    profileForm,
    setProfileForm,
    proxies,
    defaultEnvironmentLanguage,
    returnToProfileList,
    revealSelectedProfileFolder,
    createTemplateFromSelectedProfile,
    templateDrawerOpen,
    selectedTemplateId,
    templateForm,
    setTemplateForm,
    openCreateTemplateDrawer,
    openEditTemplateDrawer,
    closeTemplateDrawer,
    loadTemplateIntoProfile,
    saveProfile,
    deleteSelectedProfile,
    saveTemplate,
    deleteSelectedTemplate,
    getEnvironmentPurposeLabel,
    getEnvironmentPurposeSummary,
    summarizeIdentitySignature,
    summarizeLocaleSignature,
    summarizeHardwareSignature,
    cloudPhoneSearchQuery,
    setCloudPhoneSearchQuery,
    cloudPhoneGroupFilter,
    setCloudPhoneGroupFilter,
    cloudPhoneGroupOptions,
    selectedCloudPhoneIds,
    toggleCloudPhoneSelection,
    cloudPhoneBatchGroupName,
    setCloudPhoneBatchGroupName,
    filteredCloudPhones,
    groupedCloudPhones,
    showCloudPhoneEditor,
    selectedCloudPhoneId,
    cloudPhoneForm,
    setCloudPhoneForm,
    cloudPhoneProviders,
    cloudPhoneProviderHealthMap,
    localEmulatorDevices,
    settings,
    cloudPhoneDetails,
    cloudPhoneSheetTab,
    setCloudPhoneSheetTab,
    openCreateCloudPhonePage,
    bulkStartCloudPhones,
    bulkStopCloudPhones,
    bulkAssignCloudPhoneGroup,
    deleteCloudPhoneBulkSelection,
    openEditCloudPhonePage,
    loadCloudPhoneDetails,
    stopCloudPhone,
    startCloudPhone,
    returnToCloudPhoneList,
    saveCloudPhone,
    deleteSelectedCloudPhone,
    updateCloudPhoneProvider,
    updateCloudPhoneProxyRefMode,
    testCloudPhoneProxy,
    proxyRowFeedback,
    testingProxyId,
    proxyPanelOpen,
    proxyPanelMode,
    selectedProxyId,
    proxyForm,
    setProxyForm,
    openCreateProxyPanel,
    openEditProxyPanel,
    closeProxyPanel,
    saveProxy,
    deleteSelectedProxy,
    testProxy,
    withBusy,
    requireDesktopApi,
    setNoticeMessage,
    saveSettings,
    setSettings,
    onChangeUiLanguage: handleUiLanguageChange,
    onChangeThemeMode: handleThemeModeChange,
    cloudPhoneProviderHealth,
    importResult,
    setImportResult,
    runtimeInfo,
    rendererOperatingSystem,
    appVersion: __APP_VERSION__,
    checkForUpdates,
    currentAuthUser,
    accountProfileForm,
    setAccountProfileForm,
    accountPasswordForm,
    setAccountPasswordForm,
    saveAccountProfile,
    uploadAccountAvatar,
    saveAccountPassword,
    revokeAccountDevice,
    deleteAccountDevice,
  })

  if (!authReady || !authState?.authenticated) {
    return (
      <DesktopAuthView
        authReady={authReady}
        errorMessage={errorMessage}
        authIdentifier={authIdentifier}
        authPassword={authPassword}
        authRememberCredentials={authRememberCredentials}
        authSubmitting={authSubmitting}
        onAuthIdentifierChange={setAuthIdentifier}
        onAuthPasswordChange={setAuthPassword}
        onAuthRememberCredentialsChange={setAuthRememberCredentials}
        onSubmit={handleDesktopLogin}
      />
    )
  }

  const toasterOffset = {
    top: Math.max((runtimeInfo?.windowFrame?.titleBarOverlayHeight ?? 0) + 12, 16),
    right: Math.max((runtimeInfo?.windowFrame?.windowControlsRightInset ?? 0) + 16, 16),
    left: 16,
    bottom: 16,
  }

  return (
    <>
      <Toaster richColors position="top-right" offset={toasterOffset} />
      <MainLayout
        title={pageHeading.title}
        subtitle={pageHeading.subtitle}
        shellTitle={shellCopy.title}
        shellSubtitle={shellCopy.subtitle}
        breadcrumbItems={breadcrumbItems}
        mainNav={mainNav}
        secondaryNav={secondaryNav}
        sidebarActions={sidebarActions}
        statusText={busyMessage || t.common.runningSummary(summary.runningProfiles, summary.totalProfiles)}
        userTitle={currentAuthUser?.name || currentAuthUser?.username || currentAuthUser?.email || 'U'}
        userSubtitle={currentAuthUser?.email || currentAuthUser?.username || t.common.loading}
        logoutLabel={shellCopy.logout}
        onLogout={() => void handleDesktopLogout()}
        rendererOperatingSystem={rendererOperatingSystem}
        runtimeInfo={runtimeInfo}
      >
        <DesktopWorkspaceViews
          view={view}
          shellProps={shellProps}
          dashboardProps={dashboardViewProps}
          profilesProps={profilesViewProps}
          cloudPhonesProps={cloudPhonesViewProps}
          proxiesProps={proxiesViewProps}
          logsProps={logsViewProps}
          settingsProps={settingsViewProps}
          accountProps={accountViewProps}
        />
      </MainLayout>
    </>
  )
}

export default App
