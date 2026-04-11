import { useEffect, useMemo, useState } from 'react'
import type { Dictionary, LocaleCode } from '../i18n'
import type { EnvironmentListItem, ProfileFormState } from '../lib/desktop-types'
import { assignStableHardwareFingerprint } from '../shared/hardwareProfiles'
import type {
  EnvironmentPurpose,
  FingerprintConfig,
  ProfileRecord,
  ProxyRecord,
  TemplateRecord,
} from '../shared/types'

export type ResourceMode = 'profiles' | 'templates'
export type ProfileStatusFilter = 'all' | ProfileRecord['status']
export type ProfileDrawerTab = 'hardware' | 'network' | 'fingerprint'

type SyncSummary = {
  label: string
  detail: string
  className: string
} | null

export function useProfilesWorkspace({
  profiles,
  templates,
  proxies,
  locale,
  t,
  defaultEnvironmentLanguage,
  ensureProfilesView,
  emptyProfile,
  emptyTemplate,
  cloneFingerprintConfig,
  defaultRuntimeMetadata,
  isBlankProfileForm,
  getProfileVisualState,
  getEnvironmentPurposeLabel,
  summarizeIdentitySignature,
  summarizeLocaleSignature,
  summarizeHardwareSignature,
  getLaunchPhaseLabel,
  getEnvironmentSyncSummary,
  getRuntimeArtifactSyncSummaries,
}: {
  profiles: ProfileRecord[]
  templates: TemplateRecord[]
  proxies: ProxyRecord[]
  locale: LocaleCode
  t: Dictionary
  defaultEnvironmentLanguage: string
  ensureProfilesView: () => void
  emptyProfile: (proxyId?: string | null, defaultLanguage?: string) => ProfileFormState
  emptyTemplate: (proxyId?: string | null) => ProfileFormState
  cloneFingerprintConfig: (config: FingerprintConfig) => FingerprintConfig
  defaultRuntimeMetadata: FingerprintConfig['runtimeMetadata']
  isBlankProfileForm: (form: ProfileFormState) => boolean
  getProfileVisualState: (profile: ProfileRecord) => ProfileRecord['status']
  getEnvironmentPurposeLabel: (purpose: EnvironmentPurpose, locale: LocaleCode) => string
  summarizeIdentitySignature: (
    profile: ProfileRecord['deviceProfile'] | null,
    fallback: FingerprintConfig,
  ) => string
  summarizeLocaleSignature: (
    profile: ProfileRecord['deviceProfile'] | null,
    fallback: FingerprintConfig,
  ) => string
  summarizeHardwareSignature: (
    profile: ProfileRecord['deviceProfile'] | null,
    fallback: FingerprintConfig,
  ) => string
  getLaunchPhaseLabel: (profile: ProfileRecord) => string
  getEnvironmentSyncSummary: (profile: ProfileRecord) => SyncSummary
  getRuntimeArtifactSyncSummaries: (profile: ProfileRecord) => NonNullable<EnvironmentListItem['runtimeSync']>
}) {
  const [resourceMode, setResourceMode] = useState<ResourceMode>('profiles')
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [profilePageMode, setProfilePageMode] = useState<'list' | 'create' | 'edit'>('list')
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false)
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([])
  const [profileDrawerTab, setProfileDrawerTab] = useState<ProfileDrawerTab>('hardware')
  const [profileForm, setProfileForm] = useState(emptyProfile())
  const [templateForm, setTemplateForm] = useState(emptyTemplate())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ProfileStatusFilter>('all')
  const [groupFilter, setGroupFilter] = useState('all')
  const [batchGroupName, setBatchGroupName] = useState('')

  const showProfileWorkspaceEditor = resourceMode === 'profiles' && profilePageMode !== 'list'

  const groupOptions = useMemo(() => {
    return Array.from(
      new Set(
        profiles
          .map((profile) => profile.groupName || t.profiles.groupFallback)
          .filter(Boolean),
      ),
    )
  }, [profiles, t.profiles.groupFallback])

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

  const groupedEnvironmentItems: Array<{ name: string; items: EnvironmentListItem[] }> = useMemo(
    () =>
      Object.entries(groupedProfiles).map(([groupName, items]) => ({
        name: groupName,
        items: items.map((profile) => {
          const visualStatus = getProfileVisualState(profile)
          const selectedProxy = resolveSelectedProxy(proxies, profile.proxyId)
          const environmentSyncSummary = getEnvironmentSyncSummary(profile)
          const runtimeSyncSummaries = getRuntimeArtifactSyncSummaries(profile)
          return {
            id: profile.id,
            name: profile.name,
            metaBadges: [
              { key: 'id', label: `ID:${profile.id.slice(0, 6)}` },
              {
                key: 'proxy',
                label: selectedProxy ? `${selectedProxy.name}:${selectedProxy.port}` : t.common.noProxy,
              },
              {
                key: 'purpose',
                label: getEnvironmentPurposeLabel(profile.environmentPurpose, locale),
              },
            ],
            identity: summarizeIdentitySignature(profile.deviceProfile, profile.fingerprintConfig),
            locale: summarizeLocaleSignature(profile.deviceProfile, profile.fingerprintConfig),
            hardware: summarizeHardwareSignature(profile.deviceProfile, profile.fingerprintConfig),
            status: visualStatus,
            launchPhaseLabel: getLaunchPhaseLabel(profile),
            isLaunching: visualStatus === 'starting' || visualStatus === 'queued',
            canMoveToNurture: profile.environmentPurpose === 'register',
            canMoveToOperation: profile.environmentPurpose === 'nurture',
            sync: environmentSyncSummary,
            runtimeSync: runtimeSyncSummaries,
          }
        }),
      })),
    [
      getEnvironmentPurposeLabel,
      getLaunchPhaseLabel,
      getProfileVisualState,
      getEnvironmentSyncSummary,
      getRuntimeArtifactSyncSummaries,
      groupedProfiles,
      locale,
      proxies,
      summarizeHardwareSignature,
      summarizeIdentitySignature,
      summarizeLocaleSignature,
      t.common.noProxy,
    ],
  )

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
      environmentPurpose: profile.environmentPurpose,
      deviceProfile: profile.deviceProfile,
      fingerprintConfig: cloneFingerprintConfig(profile.fingerprintConfig),
    })
    // Only initialize when selected profile changes.
    // Polling refresh updates `profiles` frequently and should not overwrite in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProfileId])

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
      environmentPurpose: template.environmentPurpose,
      deviceProfile: null,
      fingerprintConfig: cloneFingerprintConfig(template.fingerprintConfig),
    })
  }, [selectedTemplateId, templates, cloneFingerprintConfig])

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
  }, [defaultEnvironmentLanguage, isBlankProfileForm, profileForm, selectedProfileId])

  function toggleProfileSelection(profileId: string) {
    setSelectedProfileIds((current) =>
      current.includes(profileId)
        ? current.filter((item) => item !== profileId)
        : [...current, profileId],
    )
  }

  function openCreateProfilePage() {
    ensureProfilesView()
    setSelectedProfileId(null)
    setProfileDrawerTab('hardware')
    setProfileForm(emptyProfile(proxies[0]?.id ?? null, defaultEnvironmentLanguage))
    setProfilePageMode('create')
  }

  function openEditProfilePage(profileId: string) {
    ensureProfilesView()
    setSelectedProfileId(profileId)
    setProfileDrawerTab('hardware')
    setProfilePageMode('edit')
  }

  function returnToProfileList() {
    setSelectedProfileId(null)
    setProfilePageMode('list')
  }

  function loadTemplateIntoProfile(template: TemplateRecord) {
    const draftId = `draft-template-${crypto.randomUUID()}`
    setTemplateDrawerOpen(false)
    setSelectedTemplateId(null)
    setResourceMode('profiles')
    setSelectedProfileId(null)
    setProfilePageMode('create')
    setProfileForm({
      name: '',
      proxyId: template.proxyId,
      groupName: template.groupName,
      tagsText: template.tags.join(', '),
      notes: template.notes,
      environmentPurpose: template.environmentPurpose,
      deviceProfile: null,
      fingerprintConfig: {
        ...assignStableHardwareFingerprint(
          {
            ...cloneFingerprintConfig(template.fingerprintConfig),
            runtimeMetadata: {
              ...defaultRuntimeMetadata,
              lastValidationMessages: [],
              injectedFeatures: [],
              hardwareProfileSource: 'template',
            },
          },
          draftId,
          {
            forceRegenerate: true,
            seed: draftId,
          },
        ),
      },
    })
  }

  function openCreateTemplateDrawer() {
    setSelectedTemplateId(null)
    setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
    setTemplateDrawerOpen(true)
  }

  function openEditTemplateDrawer(templateId: string) {
    setSelectedTemplateId(templateId)
    setTemplateDrawerOpen(true)
  }

  function closeTemplateDrawer() {
    setTemplateDrawerOpen(false)
    setSelectedTemplateId(null)
    setTemplateForm(emptyTemplate(proxies[0]?.id ?? null))
  }

  return {
    resourceMode,
    setResourceMode,
    selectedProfileId,
    setSelectedProfileId,
    profilePageMode,
    setProfilePageMode,
    selectedTemplateId,
    setSelectedTemplateId,
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
  }
}

function resolveSelectedProxy(
  proxies: ProxyRecord[],
  proxyId: string | null,
): ProxyRecord | null {
  if (!proxyId) {
    return null
  }
  return proxies.find((proxy) => proxy.id === proxyId) ?? null
}
