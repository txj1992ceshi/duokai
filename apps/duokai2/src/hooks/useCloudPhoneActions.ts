import type { Dictionary, LocaleCode } from '../i18n'
import type { DesktopApi } from '../shared/ipc'
import type {
  CloudPhoneDetails,
  CloudPhoneProviderKind,
  CreateCloudPhoneInput,
  ProxyRecord,
  SettingsPayload,
} from '../shared/types'

export function useCloudPhoneActions({
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
}: {
  locale: LocaleCode
  t: Dictionary
  settings: SettingsPayload
  proxies: ProxyRecord[]
  cloudPhoneForm: CreateCloudPhoneInput
  selectedCloudPhoneId: string | null
  selectedCloudPhoneIds: string[]
  setSelectedCloudPhoneIds: (value: string[]) => void
  cloudPhoneBatchGroupName: string
  setCloudPhoneBatchGroupName: (value: string) => void
  setCloudPhoneDetails: (value: CloudPhoneDetails | null) => void
  setCloudPhoneForm: (
    value:
      | CreateCloudPhoneInput
      | ((current: CreateCloudPhoneInput) => CreateCloudPhoneInput),
  ) => void
  defaultCloudPhoneProvider: string
  emptyCloudPhone: (
    settings?: SettingsPayload,
    defaultProviderKey?: string,
  ) => CreateCloudPhoneInput
  buildProviderConfig: (
    providerKey: string,
    settings: SettingsPayload,
    current?: CreateCloudPhoneInput['providerConfig'],
  ) => CreateCloudPhoneInput['providerConfig']
  providerKindForKey: (providerKey: string) => CloudPhoneProviderKind
  returnToCloudPhoneList: () => void
  requireDesktopApi: (requiredPaths?: string[]) => DesktopApi
  setNoticeMessage: (value: string) => void
  withBusy: (message: string, action: () => Promise<void>) => Promise<void>
}) {
  const copy =
    locale === 'zh-CN'
      ? {
          bulkStarted: (count: number) => `已启动 ${count} 个云手机环境。`,
          bulkStopped: (count: number) => `已停止 ${count} 个云手机环境。`,
          groupUpdated: '云手机分组已更新。',
          stopped: '云手机环境已停止。',
          started: '云手机环境已启动。',
          cloudPhoneNameRequired: '云手机环境名称不能为空。',
          savedProxyRequired: '请选择已保存代理。',
          proxyHostRequired: '代理主机不能为空。',
          proxyPortRequired: '代理端口必须大于 0。',
          proxyUsernameRequired: '代理账号不能为空。',
          proxyPasswordRequired: '代理密码不能为空。',
          cloudPhoneSaved: '云手机环境已保存，列表已刷新。',
          cloudPhoneDeleted: '云手机环境已删除。',
          bulkDeleted: (count: number) => `已删除 ${count} 个云手机环境。`,
        }
      : {
          bulkStarted: (count: number) => `Started ${count} cloud phone environments.`,
          bulkStopped: (count: number) => `Stopped ${count} cloud phone environments.`,
          groupUpdated: 'Cloud phone group assignment updated.',
          stopped: 'Cloud phone stopped.',
          started: 'Cloud phone started.',
          cloudPhoneNameRequired: 'Cloud phone name is required.',
          savedProxyRequired: 'Select a saved proxy.',
          proxyHostRequired: 'Proxy host is required.',
          proxyPortRequired: 'Proxy port must be greater than 0.',
          proxyUsernameRequired: 'Proxy username is required.',
          proxyPasswordRequired: 'Proxy password is required.',
          cloudPhoneSaved: 'Cloud phone environment saved and list refreshed.',
          cloudPhoneDeleted: 'Cloud phone environment deleted.',
          bulkDeleted: (count: number) => `Deleted ${count} cloud phone environments.`,
        }

  async function bulkStartCloudPhones() {
    await withBusy(t.busy.bulkStartCloudPhones, async () => {
      const api = requireDesktopApi(['cloudPhones.bulkStart'])
      await api.cloudPhones.bulkStart({ cloudPhoneIds: selectedCloudPhoneIds })
      setNoticeMessage(copy.bulkStarted(selectedCloudPhoneIds.length))
    })
  }

  async function bulkStopCloudPhones() {
    await withBusy(t.busy.bulkStopCloudPhones, async () => {
      const api = requireDesktopApi(['cloudPhones.bulkStop'])
      await api.cloudPhones.bulkStop({ cloudPhoneIds: selectedCloudPhoneIds })
      setNoticeMessage(copy.bulkStopped(selectedCloudPhoneIds.length))
    })
  }

  async function bulkAssignCloudPhoneGroup() {
    await withBusy(t.busy.bulkAssignCloudPhoneGroup, async () => {
      const api = requireDesktopApi(['cloudPhones.bulkAssignGroup'])
      await api.cloudPhones.bulkAssignGroup({
        cloudPhoneIds: selectedCloudPhoneIds,
        groupName: cloudPhoneBatchGroupName.trim(),
      })
      setCloudPhoneBatchGroupName('')
      setNoticeMessage(copy.groupUpdated)
    })
  }

  async function loadCloudPhoneDetails(cloudPhoneId: string) {
    await withBusy(t.busy.refreshCloudPhones, async () => {
      const api = requireDesktopApi(['cloudPhones.getDetails'])
      const details = await api.cloudPhones.getDetails(cloudPhoneId)
      setCloudPhoneDetails(details)
      setNoticeMessage(details.message)
    })
  }

  async function stopCloudPhone(cloudPhoneId: string) {
    await withBusy(t.busy.stopCloudPhone, async () => {
      const api = requireDesktopApi(['cloudPhones.stop'])
      await api.cloudPhones.stop(cloudPhoneId)
      setNoticeMessage(copy.stopped)
    })
  }

  async function startCloudPhone(cloudPhoneId: string) {
    await withBusy(t.busy.startCloudPhone, async () => {
      const api = requireDesktopApi(['cloudPhones.start'])
      await api.cloudPhones.start(cloudPhoneId)
      setNoticeMessage(copy.started)
    })
  }

  async function saveCloudPhone() {
    await withBusy(
      selectedCloudPhoneId ? t.busy.updateCloudPhone : t.busy.createCloudPhone,
      async () => {
        if (cloudPhoneForm.name.trim().length === 0) {
          throw new Error(`VALIDATION:${copy.cloudPhoneNameRequired}`)
        }
        if (cloudPhoneForm.proxyRefMode === 'saved') {
          const hasSelectedSavedProxy =
            cloudPhoneForm.proxyId !== null &&
            proxies.some((proxy) => proxy.id === cloudPhoneForm.proxyId)
          if (!hasSelectedSavedProxy) {
            throw new Error(`VALIDATION:${copy.savedProxyRequired}`)
          }
        } else {
          if (cloudPhoneForm.proxyHost.trim().length === 0) {
            throw new Error(`VALIDATION:${copy.proxyHostRequired}`)
          }
          if (cloudPhoneForm.proxyPort <= 0) {
            throw new Error(`VALIDATION:${copy.proxyPortRequired}`)
          }
          if (cloudPhoneForm.proxyUsername.trim().length === 0) {
            throw new Error(`VALIDATION:${copy.proxyUsernameRequired}`)
          }
          if (cloudPhoneForm.proxyPassword.trim().length === 0) {
            throw new Error(`VALIDATION:${copy.proxyPasswordRequired}`)
          }
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
          proxyRefMode: cloudPhoneForm.proxyRefMode,
          proxyId: cloudPhoneForm.proxyRefMode === 'saved' ? cloudPhoneForm.proxyId : null,
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
        returnToCloudPhoneList()
        setCloudPhoneForm(emptyCloudPhone(settings, defaultCloudPhoneProvider))
        setNoticeMessage(copy.cloudPhoneSaved)
      },
    )
  }

  async function deleteSelectedCloudPhone() {
    await withBusy(t.busy.deleteCloudPhone, async () => {
      if (!selectedCloudPhoneId) {
        return
      }
      const api = requireDesktopApi(['cloudPhones.delete'])
      await api.cloudPhones.delete(selectedCloudPhoneId)
      returnToCloudPhoneList()
      setCloudPhoneForm(emptyCloudPhone(settings, defaultCloudPhoneProvider))
      setNoticeMessage(copy.cloudPhoneDeleted)
    })
  }

  async function testCloudPhoneProxy() {
    await withBusy(t.busy.testCloudPhoneProxy, async () => {
      const hasSelectedSavedProxy =
        cloudPhoneForm.proxyId !== null &&
        proxies.some((proxy) => proxy.id === cloudPhoneForm.proxyId)
      if (cloudPhoneForm.proxyRefMode === 'saved' && !hasSelectedSavedProxy) {
        throw new Error(`VALIDATION:${copy.savedProxyRequired}`)
      }
      const api = requireDesktopApi(['cloudPhones.testProxy'])
      const result = await api.cloudPhones.testProxy(cloudPhoneForm)
      setNoticeMessage(result.message)
    })
  }

  async function deleteCloudPhoneBulkSelection() {
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
      setNoticeMessage(copy.bulkDeleted(selectedCloudPhoneIds.length))
    })
  }

  return {
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
  }
}
