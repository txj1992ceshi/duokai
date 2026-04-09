import { useMemo, useState } from 'react'
import type { Dictionary } from '../i18n'
import type {
  CloudPhoneDetails,
  CloudPhoneProviderKind,
  CloudPhoneProxyRefMode,
  CloudPhoneRecord,
  CreateCloudPhoneInput,
  ProxyRecord,
  SettingsPayload,
} from '../shared/types'

type CloudPhoneSheetTab = 'base' | 'network' | 'fingerprint'

function cloudPhoneRecordToForm(cloudPhone: CloudPhoneRecord): CreateCloudPhoneInput {
  return {
    name: cloudPhone.name,
    groupName: cloudPhone.groupName,
    tags: [...cloudPhone.tags],
    notes: cloudPhone.notes,
    platform: 'android',
    providerKey: cloudPhone.providerKey,
    providerKind: cloudPhone.providerKind,
    providerConfig: { ...(cloudPhone.providerConfig ?? {}) },
    providerInstanceId: cloudPhone.providerInstanceId,
    computeType: cloudPhone.computeType,
    ipLookupChannel: cloudPhone.ipLookupChannel,
    proxyRefMode: cloudPhone.proxyRefMode,
    proxyId: cloudPhone.proxyId,
    proxyType: cloudPhone.proxyType,
    ipProtocol: cloudPhone.ipProtocol,
    proxyHost: cloudPhone.proxyHost,
    proxyPort: cloudPhone.proxyPort,
    proxyUsername: cloudPhone.proxyUsername,
    proxyPassword: cloudPhone.proxyPassword,
    udpEnabled: cloudPhone.udpEnabled,
    fingerprintSettings: { ...cloudPhone.fingerprintSettings },
  }
}

export function useCloudPhonesWorkspace({
  cloudPhones,
  proxies,
  settings,
  t,
  defaultCloudPhoneProvider,
  emptyCloudPhone,
  buildProviderConfig,
  providerKindForKey,
  ensureCloudPhonesView,
}: {
  cloudPhones: CloudPhoneRecord[]
  proxies: ProxyRecord[]
  settings: SettingsPayload
  t: Dictionary
  defaultCloudPhoneProvider: string
  emptyCloudPhone: (settings?: SettingsPayload, defaultProviderKey?: string) => CreateCloudPhoneInput
  buildProviderConfig: (
    providerKey: string,
    settings: SettingsPayload,
    current?: CreateCloudPhoneInput['providerConfig'],
  ) => CreateCloudPhoneInput['providerConfig']
  providerKindForKey: (providerKey: string) => CloudPhoneProviderKind
  ensureCloudPhonesView: () => void
}) {
  const [selectedCloudPhoneId, setSelectedCloudPhoneId] = useState<string | null>(null)
  const [cloudPhonePageMode, setCloudPhonePageMode] = useState<'list' | 'create' | 'edit'>('list')
  const [selectedCloudPhoneIds, setSelectedCloudPhoneIds] = useState<string[]>([])
  const [cloudPhoneSheetTab, setCloudPhoneSheetTab] = useState<CloudPhoneSheetTab>('base')
  const [cloudPhoneForm, setCloudPhoneForm] = useState<CreateCloudPhoneInput>(emptyCloudPhone())
  const [cloudPhoneSearchQuery, setCloudPhoneSearchQuery] = useState('')
  const [cloudPhoneGroupFilter, setCloudPhoneGroupFilter] = useState('all')
  const [cloudPhoneBatchGroupName, setCloudPhoneBatchGroupName] = useState('')
  const [cloudPhoneDetails, setCloudPhoneDetails] = useState<CloudPhoneDetails | null>(null)

  const showCloudPhoneEditor = cloudPhonePageMode !== 'list'

  const cloudPhoneGroupOptions = useMemo(() => {
    return Array.from(
      new Set(
        cloudPhones
          .map((item) => item.groupName || t.profiles.groupFallback)
          .filter(Boolean),
      ),
    )
  }, [cloudPhones, t.profiles.groupFallback])

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

  function toggleCloudPhoneSelection(cloudPhoneId: string) {
    setSelectedCloudPhoneIds((current) =>
      current.includes(cloudPhoneId)
        ? current.filter((item) => item !== cloudPhoneId)
        : [...current, cloudPhoneId],
    )
  }

  function openCreateCloudPhonePage() {
    ensureCloudPhonesView()
    setSelectedCloudPhoneId(null)
    setCloudPhoneDetails(null)
    setCloudPhoneSheetTab('base')
    setCloudPhoneForm({
      ...emptyCloudPhone(settings, defaultCloudPhoneProvider),
      proxyId: proxies[0]?.id ?? null,
    })
    setCloudPhonePageMode('create')
  }

  function openEditCloudPhonePage(cloudPhoneId: string) {
    const cloudPhone = cloudPhones.find((item) => item.id === cloudPhoneId)
    if (!cloudPhone) {
      return
    }
    ensureCloudPhonesView()
    setSelectedCloudPhoneId(cloudPhoneId)
    setCloudPhoneDetails(null)
    setCloudPhoneSheetTab('base')
    setCloudPhoneForm(cloudPhoneRecordToForm(cloudPhone))
    setCloudPhonePageMode('edit')
  }

  function returnToCloudPhoneList() {
    setSelectedCloudPhoneId(null)
    setCloudPhoneDetails(null)
    setCloudPhoneSheetTab('base')
    setCloudPhonePageMode('list')
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

  function updateCloudPhoneProxyRefMode(proxyRefMode: CloudPhoneProxyRefMode) {
    setCloudPhoneForm((current) => {
      if (proxyRefMode === 'saved') {
        return {
          ...current,
          proxyRefMode,
          proxyId: current.proxyId ?? proxies[0]?.id ?? null,
        }
      }
      return {
        ...current,
        proxyRefMode,
        proxyId: null,
      }
    })
  }

  return {
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
  }
}
