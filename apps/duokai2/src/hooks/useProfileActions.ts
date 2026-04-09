import type { Dispatch, SetStateAction } from 'react'
import type { Dictionary, LocaleCode } from '../i18n'
import type { ProfileFormState } from '../lib/desktop-types'
import type { DesktopApi } from '../shared/ipc'
import type {
  EnvironmentPurpose,
  FingerprintConfig,
  ProfileRecord,
  ProxyRecord,
} from '../shared/types'

type PendingLaunchState = Record<string, number>
type RefreshAllOptions = {
  includeCloudPhoneDiagnostics?: boolean
}

export function useProfileActions({
  locale,
  t,
  profiles,
  proxies,
  defaultEnvironmentLanguage,
  defaultRuntimeMetadata,
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
  applyEnvironmentPurposePresetToForm,
  getEnvironmentPurposeLabel,
  requireDesktopApi,
  localizeError,
  setErrorMessage,
  setNoticeMessage,
  refreshAll,
  withBusy,
  returnToProfileList,
  closeTemplateDrawer,
}: {
  locale: LocaleCode
  t: Dictionary
  profiles: ProfileRecord[]
  proxies: ProxyRecord[]
  defaultEnvironmentLanguage: string
  defaultRuntimeMetadata: FingerprintConfig['runtimeMetadata']
  profileForm: ProfileFormState
  setProfileForm: Dispatch<SetStateAction<ProfileFormState>>
  selectedProfileId: string | null
  selectedProfileIds: string[]
  setSelectedProfileIds: Dispatch<SetStateAction<string[]>>
  batchGroupName: string
  setBatchGroupName: Dispatch<SetStateAction<string>>
  templateForm: ProfileFormState
  setTemplateForm: Dispatch<SetStateAction<ProfileFormState>>
  selectedTemplateId: string | null
  setPendingProfileLaunches: Dispatch<SetStateAction<PendingLaunchState>>
  emptyProfile: (proxyId?: string | null, defaultLanguage?: string) => ProfileFormState
  emptyTemplate: (proxyId?: string | null) => ProfileFormState
  normalizeTags: (value: string) => string[]
  normalizeFingerprintForSave: (config: FingerprintConfig) => FingerprintConfig
  applyEnvironmentPurposePresetToForm: (
    fingerprintConfig: FingerprintConfig,
    environmentPurpose: EnvironmentPurpose,
  ) => { fingerprintConfig: FingerprintConfig; environmentPurpose: EnvironmentPurpose }
  getEnvironmentPurposeLabel: (purpose: EnvironmentPurpose, locale: LocaleCode) => string
  requireDesktopApi: (requiredPaths?: string[]) => DesktopApi
  localizeError: (error: unknown) => string
  setErrorMessage: Dispatch<SetStateAction<string>>
  setNoticeMessage: Dispatch<SetStateAction<string>>
  refreshAll: (options?: RefreshAllOptions) => Promise<void>
  withBusy: (message: string, action: () => Promise<void>) => Promise<void>
  returnToProfileList: () => void
  closeTemplateDrawer: () => void
}) {
  const copy =
    locale === 'zh-CN'
      ? {
          profileNameRequired: '环境名称不能为空。',
          managedProxyRequired: '请选择代理管理中的代理。',
          customProxyHostRequired: '自定义代理主机不能为空。',
          customPlatformNameRequired: '自定义平台名称不能为空。',
          customPlatformUrlInvalid: '平台 URL 需以 http:// 或 https:// 开头。',
          profileSaved: '环境已保存，列表已刷新。',
          templateNameRequired: '模板名称不能为空。',
          templateSaved: '模板已保存，列表已刷新。',
          profileDeleted: '环境已删除。',
          profileQueued: '环境已加入启动队列。',
          profileStopped: '环境已停止。',
          migratingTo: (label: string) => `正在迁移到${label}...`,
          migratedTo: (label: string) => `环境已迁移到${label}。`,
          templateDeleted: '模板已删除。',
          bulkDeleted: (count: number) => `已删除 ${count} 个环境。`,
          bulkQueued: (count: number) => `已将 ${count} 个环境加入启动队列。`,
          bulkStopped: (count: number) => `已停止 ${count} 个环境。`,
          bulkGroupUpdated: '批量分组已更新。',
          profileCloned: '环境已克隆。',
          templateCreatedFromProfile: '已从当前环境生成模板。',
        }
      : {
          profileNameRequired: 'Profile name is required.',
          managedProxyRequired: 'Select a managed proxy.',
          customProxyHostRequired: 'Custom proxy host is required.',
          customPlatformNameRequired: 'Custom platform name is required.',
          customPlatformUrlInvalid: 'Platform URL must start with http:// or https://.',
          profileSaved: 'Profile saved and list refreshed.',
          templateNameRequired: 'Template name is required.',
          templateSaved: 'Template saved and list refreshed.',
          profileDeleted: 'Profile deleted.',
          profileQueued: 'Profile queued for launch.',
          profileStopped: 'Profile stopped.',
          migratingTo: (label: string) => `Migrating to ${label}...`,
          migratedTo: (label: string) => `Profile migrated to ${label}.`,
          templateDeleted: 'Template deleted.',
          bulkDeleted: (count: number) => `Deleted ${count} profiles.`,
          bulkQueued: (count: number) => `Queued ${count} profiles for launch.`,
          bulkStopped: (count: number) => `Stopped ${count} profiles.`,
          bulkGroupUpdated: 'Bulk group assignment updated.',
          profileCloned: 'Profile cloned.',
          templateCreatedFromProfile: 'Template created from current profile.',
        }

  async function saveProfile() {
    await withBusy(
      selectedProfileId ? t.busy.updateProfile : t.busy.createProfile,
      async () => {
        if (profileForm.name.trim().length === 0) {
          throw new Error(`VALIDATION:${copy.profileNameRequired}`)
        }
        if (
          profileForm.fingerprintConfig.proxySettings.proxyMode === 'manager' &&
          !profileForm.proxyId
        ) {
          throw new Error(`VALIDATION:${copy.managedProxyRequired}`)
        }
        if (
          profileForm.fingerprintConfig.proxySettings.proxyMode === 'custom' &&
          profileForm.fingerprintConfig.proxySettings.host.trim().length === 0
        ) {
          throw new Error(`VALIDATION:${copy.customProxyHostRequired}`)
        }
        if (
          profileForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          profileForm.fingerprintConfig.basicSettings.customPlatformName.trim().length === 0
        ) {
          throw new Error(`VALIDATION:${copy.customPlatformNameRequired}`)
        }
        if (
          profileForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim().length > 0 &&
          !/^https?:\/\//i.test(profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim())
        ) {
          throw new Error(`VALIDATION:${copy.customPlatformUrlInvalid}`)
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
          environmentPurpose: profileForm.environmentPurpose,
          deviceProfile: profileForm.deviceProfile ?? undefined,
          fingerprintConfig: normalizeFingerprintForSave({
            ...profileForm.fingerprintConfig,
            basicSettings: {
              ...profileForm.fingerprintConfig.basicSettings,
              customPlatformName:
                profileForm.fingerprintConfig.basicSettings.platform === 'custom'
                  ? profileForm.fingerprintConfig.basicSettings.customPlatformName.trim()
                  : '',
              customPlatformUrl: profileForm.fingerprintConfig.basicSettings.customPlatformUrl.trim(),
            },
            resolution: `${profileForm.fingerprintConfig.advanced.windowWidth}x${profileForm.fingerprintConfig.advanced.windowHeight}`,
          }),
        }

        if (selectedProfileId) {
          await api.profiles.update({
            id: selectedProfileId,
            ...payload,
          })
        } else {
          await api.profiles.create(payload)
        }
        returnToProfileList()
        setProfileForm(emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage))
        setNoticeMessage(copy.profileSaved)
      },
    )
  }

  async function saveTemplate() {
    await withBusy(
      selectedTemplateId ? t.busy.updateTemplate : t.busy.createTemplate,
      async () => {
        if (templateForm.name.trim().length === 0) {
          throw new Error(`VALIDATION:${copy.templateNameRequired}`)
        }
        if (
          templateForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          templateForm.fingerprintConfig.basicSettings.customPlatformName.trim().length === 0
        ) {
          throw new Error(`VALIDATION:${copy.customPlatformNameRequired}`)
        }
        if (
          templateForm.fingerprintConfig.basicSettings.platform === 'custom' &&
          templateForm.fingerprintConfig.basicSettings.customPlatformUrl.trim().length > 0 &&
          !/^https?:\/\//i.test(templateForm.fingerprintConfig.basicSettings.customPlatformUrl.trim())
        ) {
          throw new Error(`VALIDATION:${copy.customPlatformUrlInvalid}`)
        }
        const api = requireDesktopApi(['templates.create', 'templates.update'])
        const payload = {
          name: templateForm.name.trim(),
          proxyId: templateForm.proxyId || null,
          groupName: templateForm.groupName,
          environmentPurpose: templateForm.environmentPurpose,
          tags: normalizeTags(templateForm.tagsText),
          notes: templateForm.notes,
          fingerprintConfig: normalizeFingerprintForSave({
            ...templateForm.fingerprintConfig,
            runtimeMetadata: {
              ...defaultRuntimeMetadata,
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
          }),
        }
        if (selectedTemplateId) {
          await api.templates.update({
            id: selectedTemplateId,
            ...payload,
          })
        } else {
          await api.templates.create(payload)
        }
        closeTemplateDrawer()
        setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
        setNoticeMessage(copy.templateSaved)
      },
    )
  }

  async function deleteSelectedProfile() {
    if (!selectedProfileId) {
      return
    }
    await withBusy(t.busy.deleteProfile, async () => {
      const api = requireDesktopApi(['profiles.delete'])
      await api.profiles.delete(selectedProfileId)
      returnToProfileList()
      setProfileForm(emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage))
      setNoticeMessage(copy.profileDeleted)
    })
  }

  async function launchProfile(profileId: string) {
    setPendingProfileLaunches((current) => ({ ...current, [profileId]: Date.now() }))
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['runtime.launch'])
      await api.runtime.launch(profileId)
      setNoticeMessage(copy.profileQueued)
      await refreshAll()
    } catch (error) {
      setPendingProfileLaunches((current) => {
        const next = { ...current }
        delete next[profileId]
        return next
      })
      setErrorMessage(localizeError(error))
    }
  }

  async function stopProfile(profileId: string) {
    setErrorMessage('')
    try {
      const api = requireDesktopApi(['runtime.stop'])
      await api.runtime.stop(profileId)
      setPendingProfileLaunches((current) => {
        const next = { ...current }
        delete next[profileId]
        return next
      })
      setNoticeMessage(copy.profileStopped)
      await refreshAll()
    } catch (error) {
      setErrorMessage(localizeError(error))
    }
  }

  async function transitionProfilePurpose(profile: ProfileRecord, targetPurpose: EnvironmentPurpose) {
    if (profile.environmentPurpose === targetPurpose) {
      return
    }
    const next = applyEnvironmentPurposePresetToForm(profile.fingerprintConfig, targetPurpose)
    await withBusy(
      copy.migratingTo(getEnvironmentPurposeLabel(targetPurpose, locale)),
      async () => {
        const api = requireDesktopApi(['profiles.update'])
        await api.profiles.update({
          id: profile.id,
          name: profile.name,
          proxyId: profile.proxyId,
          groupName: profile.groupName,
          tags: profile.tags,
          notes: profile.notes,
          environmentPurpose: next.environmentPurpose,
          deviceProfile: profile.deviceProfile,
          fingerprintConfig: normalizeFingerprintForSave({
            ...next.fingerprintConfig,
            resolution: `${next.fingerprintConfig.advanced.windowWidth}x${next.fingerprintConfig.advanced.windowHeight}`,
          }),
        })
        setNoticeMessage(copy.migratedTo(getEnvironmentPurposeLabel(targetPurpose, locale)))
      },
    )
  }

  async function moveProfileToPurpose(profileId: string, targetPurpose: EnvironmentPurpose) {
    const profile = profiles.find((item) => item.id === profileId)
    if (!profile) {
      return
    }
    await transitionProfilePurpose(profile, targetPurpose)
  }

  async function deleteSelectedTemplate() {
    if (!selectedTemplateId) {
      return
    }
    await withBusy(t.busy.deleteTemplate, async () => {
      const api = requireDesktopApi(['templates.delete'])
      await api.templates.delete(selectedTemplateId)
      closeTemplateDrawer()
      setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
      setNoticeMessage(copy.templateDeleted)
    })
  }

  async function bulkDeleteProfiles() {
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
      setNoticeMessage(copy.bulkDeleted(selectedProfileIds.length))
    })
  }

  async function bulkStartProfiles() {
    await withBusy(t.busy.bulkStart, async () => {
      const api = requireDesktopApi(['profiles.bulkStart'])
      await api.profiles.bulkStart({ profileIds: selectedProfileIds })
      setNoticeMessage(copy.bulkQueued(selectedProfileIds.length))
    })
  }

  async function bulkStopProfiles() {
    await withBusy(t.busy.bulkStop, async () => {
      const api = requireDesktopApi(['profiles.bulkStop'])
      await api.profiles.bulkStop({ profileIds: selectedProfileIds })
      setNoticeMessage(copy.bulkStopped(selectedProfileIds.length))
    })
  }

  async function bulkAssignGroupToProfiles() {
    await withBusy(t.busy.bulkAssignGroup, async () => {
      const api = requireDesktopApi(['profiles.bulkAssignGroup'])
      await api.profiles.bulkAssignGroup({
        profileIds: selectedProfileIds,
        groupName: batchGroupName.trim(),
      })
      setBatchGroupName('')
      setNoticeMessage(copy.bulkGroupUpdated)
    })
  }

  async function cloneProfile(profileId: string) {
    await withBusy(t.busy.cloneProfile, async () => {
      const api = requireDesktopApi(['profiles.clone'])
      await api.profiles.clone(profileId)
      setNoticeMessage(copy.profileCloned)
    })
  }

  async function revealSelectedProfileFolder() {
    if (!selectedProfileId) {
      return
    }
    await withBusy(t.busy.openProfileFolder, async () => {
      const api = requireDesktopApi(['profiles.revealDirectory'])
      await api.profiles.revealDirectory(selectedProfileId)
    })
  }

  async function createTemplateFromSelectedProfile() {
    if (!selectedProfileId) {
      return
    }
    await withBusy(t.busy.createTemplateFromProfile, async () => {
      const api = requireDesktopApi(['templates.createFromProfile'])
      await api.templates.createFromProfile(selectedProfileId)
      setNoticeMessage(copy.templateCreatedFromProfile)
    })
  }

  return {
    saveProfile,
    saveTemplate,
    deleteSelectedProfile,
    launchProfile,
    stopProfile,
    transitionProfilePurpose,
    moveProfileToNurture: (profileId: string) => moveProfileToPurpose(profileId, 'nurture'),
    moveProfileToOperation: (profileId: string) => moveProfileToPurpose(profileId, 'operation'),
    deleteSelectedTemplate,
    bulkDeleteProfiles,
    bulkStartProfiles,
    bulkStopProfiles,
    bulkAssignGroupToProfiles,
    cloneProfile,
    revealSelectedProfileFolder,
    createTemplateFromSelectedProfile,
  }
}
