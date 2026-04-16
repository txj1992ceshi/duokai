import type { ComponentProps, Dispatch, SetStateAction } from 'react'
import { AccountView } from '../components/AccountView'
import { CloudPhonesView } from '../components/CloudPhonesView'
import { DashboardView } from '../components/DashboardView'
import { DesktopWorkspaceChrome } from '../components/DesktopWorkspaceChrome'
import { type DesktopWorkspaceViewKey } from '../components/DesktopWorkspaceViews'
import { LogsView } from '../components/LogsView'
import { ProfilesView } from '../components/ProfilesView'
import { ProxiesView } from '../components/ProxiesView'
import { SettingsView } from '../components/SettingsView'
import {
  ENVIRONMENT_PURPOSE_OPTIONS,
  STARTUP_PLATFORM_OPTIONS,
  applyPlatformPresetToForm,
  randomDesktopFingerprint,
} from '../lib/desktop-profile-presets'
import i18nClient from '../lib/i18n-client'
import type { MainNavKey } from '../layouts/MainLayout'
import type { DesktopApi } from '../shared/ipc'
import type { ImportResult } from '../shared/types'

type ShellProps = ComponentProps<typeof DesktopWorkspaceChrome>
type DashboardProps = ComponentProps<typeof DashboardView>
type ProfilesProps = ComponentProps<typeof ProfilesView>
type CloudPhonesProps = ComponentProps<typeof CloudPhonesView>
type ProxiesProps = ComponentProps<typeof ProxiesView>
type LogsProps = ComponentProps<typeof LogsView>
type SettingsProps = ComponentProps<typeof SettingsView>
type AccountProps = ComponentProps<typeof AccountView>

type ProfilePageMode = 'list' | 'create' | 'edit'
type WithBusy = (message: string, action: () => Promise<void>) => Promise<void>
type RequireDesktopApi = (requiredPaths?: string[]) => DesktopApi

export function useDesktopWorkspaceViewProps({
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
  deleteProfileById,
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
  onChangeUiLanguage,
  onChangeThemeMode,
  cloudPhoneProviderHealth,
  importResult,
  setImportResult,
  runtimeInfo,
  rendererOperatingSystem,
  appVersion,
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
}: {
  locale: DashboardProps['locale']
  t: DashboardProps['t']
  view: DesktopWorkspaceViewKey
  mainSection: ShellProps['mainSection']
  setMainSection: Dispatch<SetStateAction<MainNavKey>>
  setView: Dispatch<SetStateAction<DesktopWorkspaceViewKey>>
  environmentCenterTabs: ShellProps['environmentCenterTabs']
  errorMessage: ShellProps['errorMessage']
  syncWarningMessage: ShellProps['syncWarningMessage']
  agentReadOnlyMessage: ShellProps['agentReadOnlyMessage']
  updateState: ShellProps['updateState']
  describeUpdateStatus: ShellProps['describeUpdateStatus']
  getUpdateActionLabel: ShellProps['getUpdateActionLabel']
  handlePrimaryUpdateAction: (state: ShellProps['updateState']) => void | Promise<void>
  openReleasePage: () => void
  summary: DashboardProps['summary']
  templates: DashboardProps['templates']
  defaultCloudPhoneProvider: DashboardProps['defaultCloudPhoneProvider']
  defaultCloudPhoneProviderHealth: DashboardProps['defaultCloudPhoneProviderHealth']
  directoryInfo: SettingsProps['directoryInfo']
  runtimeHostInfo: DashboardProps['runtimeHostInfo']
  runtimeStatus: DashboardProps['runtimeStatus']
  latestNetworkCheck: DashboardProps['latestNetworkCheck']
  logs: DashboardProps['logs']
  renderProviderLabel: DashboardProps['renderProviderLabel']
  formatDate: DashboardProps['formatDate']
  resourceMode: ProfilesProps['resourceMode']
  setResourceMode: Dispatch<SetStateAction<ProfilesProps['resourceMode']>>
  setTemplateDrawerOpen: Dispatch<SetStateAction<boolean>>
  setProfilePageMode: Dispatch<SetStateAction<ProfilePageMode>>
  searchQuery: ProfilesProps['searchQuery']
  setSearchQuery: ProfilesProps['setSearchQuery']
  statusFilter: ProfilesProps['statusFilter']
  setStatusFilter: ProfilesProps['setStatusFilter']
  groupFilter: ProfilesProps['groupFilter']
  setGroupFilter: ProfilesProps['setGroupFilter']
  groupOptions: ProfilesProps['groupOptions']
  selectedProfileIds: ProfilesProps['selectedProfileIds']
  batchGroupName: ProfilesProps['batchGroupName']
  setBatchGroupName: ProfilesProps['setBatchGroupName']
  groupedEnvironmentItems: ProfilesProps['groupedEnvironmentItems']
  toggleProfileSelection: ProfilesProps['toggleProfileSelection']
  openCreateProfilePage: ProfilesProps['onOpenCreateProfile']
  openEditProfilePage: ProfilesProps['onEditProfile']
  cloneProfile: (profileId: string) => void | Promise<void>
  launchProfile: (profileId: string) => void | Promise<void>
  stopProfile: (profileId: string) => void | Promise<void>
  syncProfileConfig: (profileId: string) => void | Promise<void>
  pullProfileConfig: (profileId: string) => void | Promise<void>
  syncProfileStorageState: (profileId: string) => void | Promise<void>
  pullProfileStorageState: (profileId: string) => void | Promise<void>
  moveProfileToNurture: (profileId: string) => void | Promise<void>
  moveProfileToOperation: (profileId: string) => void | Promise<void>
  bulkStartProfiles: () => void | Promise<void>
  bulkStopProfiles: () => void | Promise<void>
  bulkAssignGroupToProfiles: () => void | Promise<void>
  bulkDeleteProfiles: () => void | Promise<void>
  showProfileWorkspaceEditor: ProfilesProps['showProfileWorkspaceEditor']
  selectedProfileId: ProfilesProps['selectedProfileId']
  profileDrawerTab: ProfilesProps['profileDrawerTab']
  setProfileDrawerTab: ProfilesProps['setProfileDrawerTab']
  profileForm: ProfilesProps['profileForm']
  setProfileForm: ProfilesProps['setProfileForm']
  proxies: ProfilesProps['proxies']
  defaultEnvironmentLanguage: ProfilesProps['defaultEnvironmentLanguage']
  returnToProfileList: ProfilesProps['onCloseProfileEditor']
  revealSelectedProfileFolder: () => void | Promise<void>
  createTemplateFromSelectedProfile: () => void | Promise<void>
  templateDrawerOpen: ProfilesProps['templateDrawerOpen']
  selectedTemplateId: ProfilesProps['selectedTemplateId']
  templateForm: ProfilesProps['templateForm']
  setTemplateForm: ProfilesProps['setTemplateForm']
  openCreateTemplateDrawer: ProfilesProps['onOpenCreateTemplate']
  openEditTemplateDrawer: ProfilesProps['onOpenEditTemplate']
  closeTemplateDrawer: ProfilesProps['onCloseTemplateDrawer']
  loadTemplateIntoProfile: ProfilesProps['onCreateProfileFromTemplate']
  saveProfile: () => void | Promise<void>
  deleteSelectedProfile: () => void | Promise<void>
  deleteProfileById: (profileId: string) => void | Promise<void>
  saveTemplate: () => void | Promise<void>
  deleteSelectedTemplate: () => void | Promise<void>
  getEnvironmentPurposeLabel: ProfilesProps['getEnvironmentPurposeLabel']
  getEnvironmentPurposeSummary: ProfilesProps['getEnvironmentPurposeSummary']
  summarizeIdentitySignature: ProfilesProps['summarizeIdentitySignature']
  summarizeLocaleSignature: ProfilesProps['summarizeLocaleSignature']
  summarizeHardwareSignature: ProfilesProps['summarizeHardwareSignature']
  cloudPhoneSearchQuery: CloudPhonesProps['cloudPhoneSearchQuery']
  setCloudPhoneSearchQuery: CloudPhonesProps['setCloudPhoneSearchQuery']
  cloudPhoneGroupFilter: CloudPhonesProps['cloudPhoneGroupFilter']
  setCloudPhoneGroupFilter: CloudPhonesProps['setCloudPhoneGroupFilter']
  cloudPhoneGroupOptions: CloudPhonesProps['cloudPhoneGroupOptions']
  selectedCloudPhoneIds: CloudPhonesProps['selectedCloudPhoneIds']
  toggleCloudPhoneSelection: CloudPhonesProps['toggleCloudPhoneSelection']
  cloudPhoneBatchGroupName: CloudPhonesProps['cloudPhoneBatchGroupName']
  setCloudPhoneBatchGroupName: CloudPhonesProps['setCloudPhoneBatchGroupName']
  filteredCloudPhones: CloudPhonesProps['filteredCloudPhones']
  groupedCloudPhones: CloudPhonesProps['groupedCloudPhones']
  showCloudPhoneEditor: CloudPhonesProps['showCloudPhoneEditor']
  selectedCloudPhoneId: CloudPhonesProps['selectedCloudPhoneId']
  cloudPhoneForm: CloudPhonesProps['cloudPhoneForm']
  setCloudPhoneForm: CloudPhonesProps['setCloudPhoneForm']
  cloudPhoneProviders: CloudPhonesProps['cloudPhoneProviders']
  cloudPhoneProviderHealthMap: CloudPhonesProps['cloudPhoneProviderHealthMap']
  localEmulatorDevices: CloudPhonesProps['localEmulatorDevices']
  settings: CloudPhonesProps['settings']
  cloudPhoneDetails: CloudPhonesProps['cloudPhoneDetails']
  cloudPhoneSheetTab: CloudPhonesProps['activeSheetTab']
  setCloudPhoneSheetTab: CloudPhonesProps['setActiveSheetTab']
  openCreateCloudPhonePage: CloudPhonesProps['onCreate']
  bulkStartCloudPhones: () => void | Promise<void>
  bulkStopCloudPhones: () => void | Promise<void>
  bulkAssignCloudPhoneGroup: () => void | Promise<void>
  deleteCloudPhoneBulkSelection: () => void | Promise<void>
  openEditCloudPhonePage: CloudPhonesProps['onEdit']
  loadCloudPhoneDetails: (cloudPhoneId: string) => void | Promise<void>
  stopCloudPhone: (cloudPhoneId: string) => void | Promise<void>
  startCloudPhone: (cloudPhoneId: string) => void | Promise<void>
  returnToCloudPhoneList: CloudPhonesProps['onCloseEditor']
  saveCloudPhone: () => void | Promise<void>
  deleteSelectedCloudPhone: () => void | Promise<void>
  updateCloudPhoneProvider: CloudPhonesProps['onUpdateProvider']
  updateCloudPhoneProxyRefMode: CloudPhonesProps['onUpdateProxyRefMode']
  testCloudPhoneProxy: () => void | Promise<void>
  proxyRowFeedback: ProxiesProps['proxyRowFeedback']
  testingProxyId: ProxiesProps['testingProxyId']
  proxyPanelOpen: ProxiesProps['proxyPanelOpen']
  proxyPanelMode: ProxiesProps['proxyPanelMode']
  selectedProxyId: ProxiesProps['selectedProxyId']
  proxyForm: ProxiesProps['proxyForm']
  setProxyForm: ProxiesProps['setProxyForm']
  openCreateProxyPanel: ProxiesProps['onOpenCreate']
  openEditProxyPanel: ProxiesProps['onOpenEdit']
  closeProxyPanel: ProxiesProps['onClosePanel']
  saveProxy: () => void | Promise<void>
  deleteSelectedProxy: () => void | Promise<void>
  testProxy: (proxyId: string) => void | Promise<void>
  withBusy: WithBusy
  requireDesktopApi: RequireDesktopApi
  setNoticeMessage: Dispatch<SetStateAction<string>>
  saveSettings: () => void | Promise<void>
  setSettings: SettingsProps['setSettings']
  onChangeUiLanguage: NonNullable<SettingsProps['onChangeUiLanguage']>
  onChangeThemeMode: NonNullable<SettingsProps['onChangeThemeMode']>
  cloudPhoneProviderHealth: SettingsProps['cloudPhoneProviderHealth']
  importResult: SettingsProps['importResult']
  setImportResult: Dispatch<SetStateAction<ImportResult | null>>
  runtimeInfo: SettingsProps['runtimeInfo']
  rendererOperatingSystem: SettingsProps['rendererOperatingSystem']
  appVersion: SettingsProps['appVersion']
  checkForUpdates: (force?: boolean) => void | Promise<void>
  currentAuthUser: AccountProps['currentAuthUser']
  accountProfileForm: AccountProps['accountProfileForm']
  setAccountProfileForm: AccountProps['setAccountProfileForm']
  accountPasswordForm: AccountProps['accountPasswordForm']
  setAccountPasswordForm: AccountProps['setAccountPasswordForm']
  saveAccountProfile: () => void | Promise<void>
  uploadAccountAvatar: () => void | Promise<void>
  saveAccountPassword: () => void | Promise<void>
  revokeAccountDevice: (deviceId: string) => void | Promise<void>
  deleteAccountDevice: (deviceId: string) => void | Promise<void>
}) {
  const desktopT = i18nClient.getFixedT(locale, 'desktop')

  const shellProps: ShellProps = {
    locale,
    errorMessage,
    syncWarningMessage,
    agentReadOnlyMessage,
    updateState,
    describeUpdateStatus,
    getUpdateActionLabel,
    onPrimaryUpdateAction: () => void handlePrimaryUpdateAction(updateState),
    onOpenReleasePage: () => void openReleasePage(),
    view,
    mainSection,
    environmentCenterTabs,
    onSelectEnvironmentTab: (nextView) => {
      setMainSection('environmentCenter')
      setView(nextView)
    },
  }

  const dashboardViewProps: DashboardProps = {
    locale,
    t,
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
  }

  const profilesViewProps: ProfilesProps = {
    locale,
    t,
    resourceMode,
    onShowProfiles: () => {
      setResourceMode('profiles')
      setTemplateDrawerOpen(false)
    },
    onShowTemplates: () => {
      setResourceMode('templates')
      setProfilePageMode('list')
    },
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
    onOpenCreateProfile: openCreateProfilePage,
    onEditProfile: openEditProfilePage,
    onCloneProfile: (profileId) => void cloneProfile(profileId),
    onLaunchProfile: (profileId) => void launchProfile(profileId),
    onStopProfile: (profileId) => void stopProfile(profileId),
    onUploadEnvironmentConfig: (profileId) => void syncProfileConfig(profileId),
    onPullEnvironmentConfig: (profileId) => void pullProfileConfig(profileId),
    onUploadStorageState: (profileId) => void syncProfileStorageState(profileId),
    onPullStorageState: (profileId) => void pullProfileStorageState(profileId),
    onMoveProfileToNurture: (profileId) => void moveProfileToNurture(profileId),
    onMoveProfileToOperation: (profileId) => void moveProfileToOperation(profileId),
    onBatchStart: () => void bulkStartProfiles(),
    onBatchStop: () => void bulkStopProfiles(),
    onBatchAssignGroup: () => void bulkAssignGroupToProfiles(),
    onBatchDelete: () => void bulkDeleteProfiles(),
    showProfileWorkspaceEditor,
    selectedProfileId,
    profileDrawerTab,
    setProfileDrawerTab,
    profileForm,
    setProfileForm,
    proxies,
    defaultEnvironmentLanguage,
    onCloseProfileEditor: returnToProfileList,
    onSaveProfile: saveProfile,
    onDeleteProfile: deleteSelectedProfile,
    onDeleteProfileById: (profileId) => void deleteProfileById(profileId),
    onRevealProfileFolder:
      selectedProfileId ? revealSelectedProfileFolder : null,
    onSaveProfileAsTemplate:
      selectedProfileId ? createTemplateFromSelectedProfile : null,
    onRandomizeProfileFingerprint: () =>
      setProfileForm((current) => ({
        ...current,
        fingerprintConfig: randomDesktopFingerprint(current.fingerprintConfig),
      })),
    templates,
    templateDrawerOpen,
    selectedTemplateId,
    templateForm,
    setTemplateForm,
    onOpenCreateTemplate: openCreateTemplateDrawer,
    onOpenEditTemplate: openEditTemplateDrawer,
    onCloseTemplateDrawer: closeTemplateDrawer,
    onCreateProfileFromTemplate: loadTemplateIntoProfile,
    onSaveTemplate: saveTemplate,
    onDeleteTemplate: deleteSelectedTemplate,
    startupPlatformOptions: STARTUP_PLATFORM_OPTIONS,
    environmentPurposeOptions: ENVIRONMENT_PURPOSE_OPTIONS,
    applyPlatformPresetToForm,
    getEnvironmentPurposeLabel,
    getEnvironmentPurposeSummary,
    summarizeIdentitySignature,
    summarizeLocaleSignature,
    summarizeHardwareSignature,
  }

  const cloudPhonesViewProps: CloudPhonesProps = {
    locale,
    t,
    cloudPhoneSearchQuery,
    setCloudPhoneSearchQuery,
    cloudPhoneGroupFilter,
    setCloudPhoneGroupFilter,
    cloudPhoneGroupOptions,
    defaultCloudPhoneProviderHealth,
    defaultCloudPhoneProvider,
    renderProviderLabel,
    selectedCloudPhoneIds,
    toggleCloudPhoneSelection,
    cloudPhoneBatchGroupName,
    setCloudPhoneBatchGroupName,
    filteredCloudPhones,
    groupedCloudPhones,
    proxies,
    showCloudPhoneEditor,
    selectedCloudPhoneId,
    cloudPhoneForm,
    setCloudPhoneForm,
    cloudPhoneProviders,
    cloudPhoneProviderHealthMap,
    localEmulatorDevices,
    settings,
    defaultEnvironmentLanguage,
    cloudPhoneDetails,
    activeSheetTab: cloudPhoneSheetTab,
    setActiveSheetTab: setCloudPhoneSheetTab,
    onCreate: openCreateCloudPhonePage,
    onBulkStart: () => void bulkStartCloudPhones(),
    onBulkStop: () => void bulkStopCloudPhones(),
    onBulkAssignGroup: () => void bulkAssignCloudPhoneGroup(),
    onBulkDelete: () => void deleteCloudPhoneBulkSelection(),
    onEdit: openEditCloudPhonePage,
    onLoadDetails: (cloudPhoneId) => void loadCloudPhoneDetails(cloudPhoneId),
    onStop: (cloudPhoneId) => void stopCloudPhone(cloudPhoneId),
    onStart: (cloudPhoneId) => void startCloudPhone(cloudPhoneId),
    onCloseEditor: returnToCloudPhoneList,
    onSave: () => void saveCloudPhone(),
    onDelete: () => void deleteSelectedCloudPhone(),
    onUpdateProvider: updateCloudPhoneProvider,
    onUpdateProxyRefMode: updateCloudPhoneProxyRefMode,
    onTestProxy: () => void testCloudPhoneProxy(),
  }

  const proxiesViewProps: ProxiesProps = {
    locale,
    t,
    proxies,
    proxyRowFeedback,
    testingProxyId,
    proxyPanelOpen,
    proxyPanelMode,
    selectedProxyId,
    proxyForm,
    setProxyForm,
    onOpenCreate: openCreateProxyPanel,
    onOpenEdit: openEditProxyPanel,
    onClosePanel: closeProxyPanel,
    onSave: () => void saveProxy(),
    onDelete: () => void deleteSelectedProxy(),
    onTest: (proxyId) => void testProxy(proxyId),
  }

  const logsViewProps: LogsProps = {
    locale,
    t,
    logs,
    formatDate,
    onClear: () =>
      void withBusy(t.busy.clearLogs, async () => {
        const api = requireDesktopApi(['logs.clear'])
        await api.logs.clear()
        setNoticeMessage(desktopT('feedback.logsCleared'))
      }),
    onBackToCenter: () => {
      setMainSection('environmentCenter')
      setView('dashboard')
    },
  }

  const settingsViewProps: SettingsProps = {
    locale,
    t,
    settings,
    setSettings,
    onChangeUiLanguage,
    onChangeThemeMode,
    defaultEnvironmentLanguage,
    cloudPhoneProviders,
    defaultCloudPhoneProvider,
    cloudPhoneProviderHealth,
    localEmulatorDevices,
    importResult,
    directoryInfo,
    runtimeInfo,
    latestNetworkCheck,
    updateState,
    rendererOperatingSystem,
    appVersion,
    renderProviderLabel,
    formatDate,
    describeUpdateStatus,
    getUpdateActionLabel,
    onSave: () => void saveSettings(),
    onExportBundle: () =>
      void withBusy(t.busy.exportBundle, async () => {
        const api = requireDesktopApi(['data.exportBundle'])
        await api.data.exportBundle()
        setNoticeMessage(desktopT('feedback.configurationBundleExported'))
      }),
    onImportBundle: () =>
      void withBusy(t.busy.importBundle, async () => {
        const api = requireDesktopApi(['data.importBundle'])
        const result = await api.data.importBundle()
        setImportResult(result)
        if (result) {
          setNoticeMessage(desktopT('feedback.configurationBundleImported'))
        }
      }),
    onPrimaryUpdateAction: () => void handlePrimaryUpdateAction(updateState),
    onCheckForUpdates: () => void checkForUpdates(true),
    onOpenReleasePage: () => void openReleasePage(),
  }

  const accountViewProps: AccountProps = {
    locale,
    currentAuthUser,
    accountProfileForm,
    setAccountProfileForm,
    accountPasswordForm,
    setAccountPasswordForm,
    formatDate,
    onSaveProfile: () => void saveAccountProfile(),
    onUploadAvatar: () => void uploadAccountAvatar(),
    onSavePassword: () => void saveAccountPassword(),
    onRevokeDevice: (deviceId) => void revokeAccountDevice(deviceId),
    onDeleteDevice: (deviceId) => void deleteAccountDevice(deviceId),
  }

  return {
    shellProps,
    dashboardViewProps,
    profilesViewProps,
    cloudPhonesViewProps,
    proxiesViewProps,
    logsViewProps,
    settingsViewProps,
    accountViewProps,
  }
}
