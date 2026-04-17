import type { Dispatch, SetStateAction } from 'react'
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetOverlay,
  SheetTitle,
  Textarea,
} from '@duokai/ui'
import {
  translateStatus,
  type Dictionary,
  type LocaleCode,
} from '../i18n'
import type { EnvironmentListItem, ProfileFormState } from '../lib/desktop-types'
import {
  SUPPORTED_ENVIRONMENT_LANGUAGES,
  normalizeEnvironmentLanguage,
} from '../shared/environmentLanguages'
import { COMMON_TIMEZONE_OPTIONS } from '../shared/timezones'
import type {
  EnvironmentPurpose,
  FingerprintConfig,
  ProfileRecord,
  ProxyRecord,
  TemplateRecord,
} from '../shared/types'
import { EmptyState } from './feedback/EmptyState'
import { EnvironmentList } from './environment/EnvironmentList'
import { ProfileDrawer } from './profile/ProfileDrawer'

type ResourceMode = 'profiles' | 'templates'
type StatusFilter = 'all' | ProfileRecord['status']
type DrawerTab = 'hardware' | 'network' | 'fingerprint'

type StartupPlatformOption = {
  value: string
  labelZh: string
  labelEn: string
}

type EnvironmentPurposeOption = {
  value: EnvironmentPurpose
  zh: string
  en: string
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

export function ProfilesView({
  locale,
  t,
  resourceMode,
  onShowProfiles,
  onShowTemplates,
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
  onOpenCreateProfile,
  onUploadEnvironmentConfig,
  onPullEnvironmentConfig,
  onUploadStorageState,
  onPullStorageState,
  onEditProfile,
  onCloneProfile,
  onLaunchProfile,
  onStopProfile,
  onDeleteProfileById,
  onMoveProfileToNurture,
  onMoveProfileToOperation,
  onBatchStart,
  onBatchStop,
  onBatchAssignGroup,
  onBatchDelete,
  showProfileWorkspaceEditor,
  selectedProfileId,
  profileDrawerTab,
  setProfileDrawerTab,
  profileForm,
  setProfileForm,
  proxies,
  defaultEnvironmentLanguage,
  onCloseProfileEditor,
  onSaveProfile,
  onDeleteProfile,
  onRevealProfileFolder,
  onSaveProfileAsTemplate,
  onRandomizeProfileFingerprint,
  templates,
  templateDrawerOpen,
  selectedTemplateId,
  templateForm,
  setTemplateForm,
  onOpenCreateTemplate,
  onOpenEditTemplate,
  onCloseTemplateDrawer,
  onCreateProfileFromTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  startupPlatformOptions,
  environmentPurposeOptions,
  applyPlatformPresetToForm,
  getEnvironmentPurposeLabel,
  getEnvironmentPurposeSummary,
  summarizeIdentitySignature,
  summarizeLocaleSignature,
  summarizeHardwareSignature,
}: {
  locale: LocaleCode
  t: Dictionary
  resourceMode: ResourceMode
  onShowProfiles: () => void
  onShowTemplates: () => void
  searchQuery: string
  setSearchQuery: Dispatch<SetStateAction<string>>
  statusFilter: StatusFilter
  setStatusFilter: Dispatch<SetStateAction<StatusFilter>>
  groupFilter: string
  setGroupFilter: Dispatch<SetStateAction<string>>
  groupOptions: string[]
  selectedProfileIds: string[]
  batchGroupName: string
  setBatchGroupName: Dispatch<SetStateAction<string>>
  groupedEnvironmentItems: Array<{ name: string; items: EnvironmentListItem[] }>
  toggleProfileSelection: (profileId: string) => void
  onOpenCreateProfile: () => void
  onUploadEnvironmentConfig: (profileId: string) => void | Promise<void>
  onPullEnvironmentConfig: (profileId: string) => void | Promise<void>
  onUploadStorageState: (profileId: string) => void | Promise<void>
  onPullStorageState: (profileId: string) => void | Promise<void>
  onEditProfile: (profileId: string) => void
  onCloneProfile: (profileId: string) => void
  onLaunchProfile: (profileId: string) => void
  onStopProfile: (profileId: string) => void
  onDeleteProfileById: (profileId: string) => void | Promise<void>
  onMoveProfileToNurture: (profileId: string) => void
  onMoveProfileToOperation: (profileId: string) => void
  onBatchStart: () => void
  onBatchStop: () => void
  onBatchAssignGroup: () => void
  onBatchDelete: () => void
  showProfileWorkspaceEditor: boolean
  selectedProfileId: string | null
  profileDrawerTab: DrawerTab
  setProfileDrawerTab: Dispatch<SetStateAction<DrawerTab>>
  profileForm: ProfileFormState
  setProfileForm: Dispatch<SetStateAction<ProfileFormState>>
  proxies: ProxyRecord[]
  defaultEnvironmentLanguage: string
  onCloseProfileEditor: () => void
  onSaveProfile: () => void | Promise<void>
  onDeleteProfile: () => void | Promise<void>
  onRevealProfileFolder: (() => void | Promise<void>) | null
  onSaveProfileAsTemplate: (() => void | Promise<void>) | null
  onRandomizeProfileFingerprint: () => void
  templates: TemplateRecord[]
  templateDrawerOpen: boolean
  selectedTemplateId: string | null
  templateForm: ProfileFormState
  setTemplateForm: Dispatch<SetStateAction<ProfileFormState>>
  onOpenCreateTemplate: () => void
  onOpenEditTemplate: (templateId: string) => void
  onCloseTemplateDrawer: () => void
  onCreateProfileFromTemplate: (template: TemplateRecord) => void
  onSaveTemplate: () => void | Promise<void>
  onDeleteTemplate: () => void | Promise<void>
  startupPlatformOptions: readonly StartupPlatformOption[]
  environmentPurposeOptions: readonly EnvironmentPurposeOption[]
  applyPlatformPresetToForm: (
    fingerprintConfig: FingerprintConfig,
    environmentPurpose: EnvironmentPurpose,
    platform: string,
  ) => { fingerprintConfig: FingerprintConfig; environmentPurpose: EnvironmentPurpose }
  getEnvironmentPurposeLabel: (purpose: EnvironmentPurpose, locale: LocaleCode) => string
  getEnvironmentPurposeSummary: (purpose: EnvironmentPurpose, locale: LocaleCode) => string
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
}) {
  const isZh = locale === 'zh-CN'
  const copy = isZh
    ? {
        drawerDescription: '从右侧抽屉编辑环境配置，不打断列表上下文。',
        emptyTemplatesTitle: '还没有模板',
        emptyTemplatesDescription:
          '先把常用平台、代理与地区配置沉淀为模板，后续新建环境会快很多。',
        templateWorkspaceTitle: '模板工作台',
        templatesWithProxy: '带代理模板',
        operationTemplates: '运营用途模板',
        registerTemplates: '注册用途模板',
        platformNamePlaceholder: '平台名称',
        languageFromIp: '语言跟随 IP',
        manualLanguage: '手动语言',
        manualTimezone: '手动时区',
        geoFromIp: '位置跟随 IP',
        manualGeo: '手动位置',
        autoResolved: '由代理 IP 自动解析',
        manualMode: '手动模式',
        webrtcDefault: '默认',
        webrtcProxyAware: '代理感知（推荐）',
        webrtcDisabled: '禁用',
        modeStableCustom: '稳定自定义（推荐）',
        modeLegacyRandom: '旧版随机',
        modeOff: '关闭',
        webglImage: 'WebGL 图像',
        audio: '音频',
        clientRects: 'ClientRects',
        mediaDevices: '媒体设备',
        speechVoices: '语音列表',
        close: '关闭',
      }
    : {
        drawerDescription: 'Edit the profile in a right-side drawer without losing list context.',
        emptyTemplatesTitle: 'No templates yet',
        emptyTemplatesDescription:
          'Save your frequent platform, proxy, and locale combinations as templates to speed up profile creation.',
        templateWorkspaceTitle: 'Template workspace',
        templatesWithProxy: 'Templates with proxy',
        operationTemplates: 'Operation templates',
        registerTemplates: 'Register templates',
        platformNamePlaceholder: 'Platform name',
        languageFromIp: 'Language from IP',
        manualLanguage: 'Manual language',
        manualTimezone: 'Manual timezone',
        geoFromIp: 'Geo from IP',
        manualGeo: 'Manual geo',
        autoResolved: 'Resolved automatically from the proxy IP',
        manualMode: 'Manual mode',
        webrtcDefault: 'Default',
        webrtcProxyAware: 'Proxy-aware (Recommended)',
        webrtcDisabled: 'Disabled',
        modeStableCustom: 'Stable custom (Recommended)',
        modeLegacyRandom: 'Legacy random',
        modeOff: 'Off',
        webglImage: 'WebGL image',
        audio: 'Audio',
        clientRects: 'ClientRects',
        mediaDevices: 'Media devices',
        speechVoices: 'Speech voices',
        close: 'Close',
      }
  const getStartupPlatformLabel = (item: StartupPlatformOption) => (isZh ? item.labelZh : item.labelEn)
  const getEnvironmentPurposeOptionLabel = (item: EnvironmentPurposeOption) => (isZh ? item.zh : item.en)

  return (
    <section className="space-y-6">
      <Card className="rounded-[28px] border border-slate-200 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="m-0 text-xl font-semibold text-slate-950">{t.profiles.title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={resourceMode === 'profiles' ? 'primary' : 'ghost'} onClick={onShowProfiles}>
              {t.profiles.manageProfiles}
            </Button>
            <Button variant={resourceMode === 'templates' ? 'primary' : 'ghost'} onClick={onShowTemplates}>
              {t.profiles.manageTemplates}
            </Button>
            {resourceMode === 'profiles' ? (
              <Button variant="primary" onClick={onOpenCreateProfile}>
                {t.profiles.createProfile}
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      {resourceMode === 'profiles' ? (
        <>
          <Card className="rounded-[24px] border border-slate-200 shadow-none">
            <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1.6fr)_220px_220px]">
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={`${t.common.search}...`}
              />
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              >
                <option value="all">
                  {t.profiles.statusFilter}: {t.common.all}
                </option>
                <option value="queued">{translateStatus(locale, 'queued')}</option>
                <option value="starting">{translateStatus(locale, 'starting')}</option>
                <option value="running">{translateStatus(locale, 'running')}</option>
                <option value="idle">{translateStatus(locale, 'idle')}</option>
                <option value="stopped">{translateStatus(locale, 'stopped')}</option>
                <option value="error">{translateStatus(locale, 'error')}</option>
              </Select>
              <Select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                <option value="all">
                  {t.profiles.groupFilter}: {t.common.all}
                </option>
                {groupOptions.map((groupName) => (
                  <option key={groupName} value={groupName}>
                    {groupName}
                  </option>
                ))}
              </Select>
            </div>
          </Card>

          <Card className="rounded-[24px] border border-slate-200 shadow-none">
            <div className="flex flex-wrap items-center gap-3 p-4">
              <span className="mr-2 text-sm font-medium text-slate-700">
                {t.profiles.selectedCount(selectedProfileIds.length)}
              </span>
              <Button disabled={selectedProfileIds.length === 0} onClick={onBatchStart}>
                {t.profiles.batchStart}
              </Button>
              <Button variant="secondary" disabled={selectedProfileIds.length === 0} onClick={onBatchStop}>
                {t.profiles.batchStop}
              </Button>
              <div className="min-w-[200px] flex-1">
                <Input
                  value={batchGroupName}
                  onChange={(event) => setBatchGroupName(event.target.value)}
                  placeholder={t.profiles.group}
                />
              </div>
              <Button
                variant="secondary"
                disabled={selectedProfileIds.length === 0 || batchGroupName.trim().length === 0}
                onClick={onBatchAssignGroup}
              >
                {t.profiles.batchAssignGroup}
              </Button>
              <Button variant="danger" disabled={selectedProfileIds.length === 0} onClick={onBatchDelete}>
                {t.profiles.batchDelete}
              </Button>
            </div>
          </Card>

          {!showProfileWorkspaceEditor ? (
              <EnvironmentList
                groups={groupedEnvironmentItems}
                selectedIds={selectedProfileIds}
                onToggleSelect={toggleProfileSelection}
                onCreate={onOpenCreateProfile}
                onUploadConfig={onUploadEnvironmentConfig}
                onPullConfig={onPullEnvironmentConfig}
                onUploadStorageState={onUploadStorageState}
                onPullStorageState={onPullStorageState}
                onEdit={onEditProfile}
                onClone={onCloneProfile}
                onLaunch={onLaunchProfile}
                onStop={onStopProfile}
                onDelete={onDeleteProfileById}
                onMoveToNurture={onMoveProfileToNurture}
                onMoveToOperation={onMoveProfileToOperation}
              />
          ) : null}

          <ProfileDrawer
            key={selectedProfileId ?? 'new'}
            open={showProfileWorkspaceEditor}
            locale={locale}
            title={selectedProfileId ? t.profiles.editProfile : t.profiles.createProfile}
            description={
              copy.drawerDescription
            }
            activeTab={profileDrawerTab}
            onTabChange={setProfileDrawerTab}
            profileForm={profileForm}
            setProfileForm={setProfileForm}
            proxies={proxies}
            selectedProfileId={selectedProfileId}
            defaultEnvironmentLanguage={defaultEnvironmentLanguage}
            t={t}
            onClose={onCloseProfileEditor}
            onSave={onSaveProfile}
            onDelete={onDeleteProfile}
            onRevealFolder={onRevealProfileFolder}
            onSaveAsTemplate={onSaveProfileAsTemplate}
            onRandomizeFingerprint={onRandomizeProfileFingerprint}
          />
        </>
      ) : (
        <section className="space-y-6">
          {!templateDrawerOpen ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_320px]">
            <Card className="rounded-[28px] border border-slate-200 shadow-none">
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-lg font-semibold text-slate-950">{t.templates.title}</h2>
                  </div>
                  <Button variant="primary" onClick={onOpenCreateTemplate}>
                    {t.templates.newTemplate}
                  </Button>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {templates.map((template) => {
                  const selectedProxy = resolveSelectedProxy(proxies, template.proxyId)
                  return (
                    <div
                      key={template.id}
                      className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    >
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="neutral" className="font-mono uppercase">
                            {template.id.slice(0, 6)}
                          </Badge>
                          <Badge tone="primary">
                            {getEnvironmentPurposeLabel(template.environmentPurpose, locale)}
                          </Badge>
                          <Badge tone={selectedProxy ? 'success' : 'neutral'}>
                            {selectedProxy
                              ? `${selectedProxy.name} · ${selectedProxy.host}:${selectedProxy.port}`
                              : t.common.noProxy}
                          </Badge>
                        </div>
                        <div>
                          <div className="text-base font-semibold text-slate-950">{template.name}</div>
                          <div className="mt-1 text-sm text-slate-500">
                            {summarizeIdentitySignature(null, template.fingerprintConfig)}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                          <span>{template.groupName || t.profiles.groupFallback}</span>
                          <span>·</span>
                          <span>{template.tags.join(', ') || t.common.noTags}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Button variant="secondary" onClick={() => onCreateProfileFromTemplate(template)}>
                          {t.templates.createProfileFromTemplate}
                        </Button>
                        <Button variant="ghost" onClick={() => onOpenEditTemplate(template.id)}>
                          {t.common.edit}
                        </Button>
                      </div>
                    </div>
                  )
                })}

                {templates.length === 0 ? (
                  <div className="p-5">
                    <EmptyState
                      title={copy.emptyTemplatesTitle}
                      description={copy.emptyTemplatesDescription}
                      actionLabel={t.templates.newTemplate}
                      onAction={onOpenCreateTemplate}
                    />
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="rounded-[28px] border border-slate-200 shadow-none">
              <div className="space-y-4 p-5">
                <div>
                  <div className="text-sm font-medium text-slate-500">{copy.templateWorkspaceTitle}</div>
                  <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                    {templates.length}
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                    <span className="text-sm text-slate-500">{copy.templatesWithProxy}</span>
                    <span className="text-sm font-semibold text-slate-950">
                      {templates.filter((template) => Boolean(template.proxyId)).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                    <span className="text-sm text-slate-500">{copy.operationTemplates}</span>
                    <span className="text-sm font-semibold text-slate-950">
                      {templates.filter((template) => template.environmentPurpose === 'operation').length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                    <span className="text-sm text-slate-500">{copy.registerTemplates}</span>
                    <span className="text-sm font-semibold text-slate-950">
                      {templates.filter((template) => template.environmentPurpose === 'register').length}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
            </div>
          ) : null}

          <Sheet open={templateDrawerOpen}>
            <SheetOverlay onClick={onCloseTemplateDrawer} />
            <SheetContent className="max-w-[420px]">
              <SheetHeader>
                <SheetTitle>
                  {selectedTemplateId ? t.templates.editTemplate : t.templates.createTemplate}
                </SheetTitle>
              </SheetHeader>

              <div className="duokai-scrollbar flex-1 overflow-y-auto p-5">
                <div className="space-y-4">
                  <Input
                    value={templateForm.name}
                    onChange={(event) =>
                      setTemplateForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder={t.profiles.name}
                  />
                  <Input
                    value={templateForm.groupName}
                    onChange={(event) =>
                      setTemplateForm((current) => ({ ...current, groupName: event.target.value }))
                    }
                    placeholder={t.profiles.group}
                  />
                  <Input
                    value={templateForm.tagsText}
                    onChange={(event) =>
                      setTemplateForm((current) => ({ ...current, tagsText: event.target.value }))
                    }
                    placeholder={t.profiles.tagsPlaceholder}
                  />
                  <Select
                    value={templateForm.fingerprintConfig.basicSettings.platform}
                    onChange={(event) =>
                      setTemplateForm((current) => {
                        const next = applyPlatformPresetToForm(
                          current.fingerprintConfig,
                          current.environmentPurpose,
                          event.target.value,
                        )
                        return {
                          ...current,
                          environmentPurpose: next.environmentPurpose,
                          fingerprintConfig: next.fingerprintConfig,
                          deviceProfile: null,
                        }
                      })
                    }
                  >
                    {startupPlatformOptions.map((item) => (
                      <option key={item.value || 'none'} value={item.value}>
                        {getStartupPlatformLabel(item)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={templateForm.environmentPurpose}
                    onChange={(event) =>
                      setTemplateForm((current) => ({
                        ...current,
                        environmentPurpose: event.target.value as EnvironmentPurpose,
                      }))
                    }
                  >
                    {environmentPurposeOptions.map((item) => (
                      <option key={item.value} value={item.value}>
                        {getEnvironmentPurposeOptionLabel(item)}
                      </option>
                    ))}
                  </Select>
                  {templateForm.fingerprintConfig.basicSettings.platform === 'custom' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
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
                        placeholder={copy.platformNamePlaceholder}
                      />
                      <Input
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
                    </div>
                  ) : null}
                  <Select
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
                        {proxy.name} · {proxy.type.toUpperCase()} {proxy.host}:{proxy.port}
                      </option>
                    ))}
                  </Select>
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    <div>{getEnvironmentPurposeSummary(templateForm.environmentPurpose, locale)}</div>
                    <div className="mt-2">
                      {summarizeLocaleSignature(null, templateForm.fingerprintConfig)}
                    </div>
                    <div className="mt-2">
                      {summarizeHardwareSignature(null, templateForm.fingerprintConfig)}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Select
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
                      <option value="auto">
                        {copy.languageFromIp}
                      </option>
                      <option value="manual">{copy.manualLanguage}</option>
                    </Select>
                    <Select
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
                      <option value="manual">{copy.manualTimezone}</option>
                    </Select>
                    <Select
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
                      <option value="auto">{copy.geoFromIp}</option>
                      <option value="manual">{copy.manualGeo}</option>
                    </Select>
                  </div>
                  {!templateForm.fingerprintConfig.advanced.autoLanguageFromIp ? (
                    <Select
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
                    </Select>
                  ) : null}
                  {!templateForm.fingerprintConfig.advanced.autoTimezoneFromIp ? (
                    <div className="space-y-2">
                      <Select
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
                      >
                        {COMMON_TIMEZONE_OPTIONS.map((timezone) => (
                          <option key={timezone} value={timezone}>
                            {timezone}
                          </option>
                        ))}
                      </Select>
                      <p className="text-xs text-slate-500">{copy.manualMode}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        value={templateForm.fingerprintConfig.timezone}
                        readOnly
                        placeholder="America/Los_Angeles"
                      />
                      <p className="text-xs text-slate-500">{copy.autoResolved}</p>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Input
                      value={templateForm.fingerprintConfig.advanced.geolocation}
                      readOnly={templateForm.fingerprintConfig.advanced.autoGeolocationFromIp}
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
                    <p className="text-xs text-slate-500">
                      {templateForm.fingerprintConfig.advanced.autoGeolocationFromIp ? copy.autoResolved : copy.manualMode}
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
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
                      placeholder={t.profiles.resolution}
                    />
                    <Select
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
                      <option value="default">{copy.webrtcDefault}</option>
                      <option value="proxy-aware">{copy.webrtcProxyAware}</option>
                      <option value="disabled">{copy.webrtcDisabled}</option>
                    </Select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      value={templateForm.fingerprintConfig.advanced.canvasMode}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              canvasMode: event.target.value as FingerprintConfig['advanced']['canvasMode'],
                            },
                          },
                        }))
                      }
                    >
                      <option value="custom">{copy.modeStableCustom}</option>
                      <option value="random">{copy.modeLegacyRandom}</option>
                      <option value="off">{copy.modeOff}</option>
                    </Select>
                    <Select
                      value={templateForm.fingerprintConfig.advanced.webglImageMode}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              webglImageMode: event.target.value as FingerprintConfig['advanced']['webglImageMode'],
                            },
                          },
                        }))
                      }
                    >
                      <option value="custom">{copy.webglImage}: {copy.modeStableCustom}</option>
                      <option value="random">{copy.webglImage}: {copy.modeLegacyRandom}</option>
                      <option value="off">{copy.webglImage}: {copy.modeOff}</option>
                    </Select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      value={templateForm.fingerprintConfig.advanced.audioContextMode}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              audioContextMode: event.target.value as FingerprintConfig['advanced']['audioContextMode'],
                            },
                          },
                        }))
                      }
                    >
                      <option value="custom">{copy.audio}: {copy.modeStableCustom}</option>
                      <option value="random">{copy.audio}: {copy.modeLegacyRandom}</option>
                      <option value="off">{copy.audio}: {copy.modeOff}</option>
                    </Select>
                    <Select
                      value={templateForm.fingerprintConfig.advanced.clientRectsMode}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              clientRectsMode: event.target.value as FingerprintConfig['advanced']['clientRectsMode'],
                            },
                          },
                        }))
                      }
                    >
                      <option value="off">{copy.clientRects}: {copy.modeOff}</option>
                      <option value="custom">{copy.clientRects}: {copy.modeStableCustom}</option>
                      <option value="random">{copy.clientRects}: {copy.modeLegacyRandom}</option>
                    </Select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Select
                      value={templateForm.fingerprintConfig.advanced.mediaDevicesMode}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              mediaDevicesMode: event.target.value as FingerprintConfig['advanced']['mediaDevicesMode'],
                            },
                          },
                        }))
                      }
                    >
                      <option value="custom">{copy.mediaDevices}: {copy.modeStableCustom}</option>
                      <option value="random">{copy.mediaDevices}: {copy.modeLegacyRandom}</option>
                      <option value="off">{copy.mediaDevices}: {copy.modeOff}</option>
                    </Select>
                    <Select
                      value={templateForm.fingerprintConfig.advanced.speechVoicesMode}
                      onChange={(event) =>
                        setTemplateForm((current) => ({
                          ...current,
                          fingerprintConfig: {
                            ...current.fingerprintConfig,
                            advanced: {
                              ...current.fingerprintConfig.advanced,
                              speechVoicesMode: event.target.value as FingerprintConfig['advanced']['speechVoicesMode'],
                            },
                          },
                        }))
                      }
                    >
                      <option value="custom">{copy.speechVoices}: {copy.modeStableCustom}</option>
                      <option value="random">{copy.speechVoices}: {copy.modeLegacyRandom}</option>
                      <option value="off">{copy.speechVoices}: {copy.modeOff}</option>
                    </Select>
                  </div>
                  <Textarea
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
                    placeholder={t.profiles.userAgent}
                  />
                  <Textarea
                    rows={4}
                    value={templateForm.notes}
                    onChange={(event) =>
                      setTemplateForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder={t.profiles.notes}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
                <Button variant="ghost" onClick={onCloseTemplateDrawer}>
                  {copy.close}
                </Button>
                <div className="flex items-center gap-2">
                  {selectedTemplateId ? (
                    <Button variant="danger" onClick={onDeleteTemplate}>
                      {t.templates.deleteTemplate}
                    </Button>
                  ) : null}
                  <Button variant="primary" onClick={onSaveTemplate}>
                    {selectedTemplateId ? t.templates.updateTemplate : t.templates.createTemplate}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </section>
      )}
    </section>
  )
}
