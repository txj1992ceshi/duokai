import { useRef, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Select,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetOverlay,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@duokai/ui'
import type { Dictionary } from '../i18n'
import { SUPPORTED_ENVIRONMENT_LANGUAGES } from '../shared/environmentLanguages'
import type {
  CloudPhoneDetails,
  CloudPhoneProviderHealth,
  CloudPhoneProviderSummary,
  CloudPhoneProxyRefMode,
  CloudPhoneRecord,
  CreateCloudPhoneInput,
  DetectedLocalEmulator,
  ProxyRecord,
  SettingsPayload,
} from '../shared/types'
import { EmptyState } from './feedback/EmptyState'

export type CloudPhoneSheetTab = 'base' | 'network' | 'fingerprint'

function resolveSelectedProxy(proxies: ProxyRecord[], proxyId: string | null): ProxyRecord | null {
  if (!proxyId) {
    return null
  }
  return proxies.find((proxy) => proxy.id === proxyId) ?? null
}

function getCloudPhoneStatusTone(
  status: CloudPhoneRecord['status'],
): 'neutral' | 'primary' | 'success' | 'warning' | 'danger' {
  if (status === 'running') {
    return 'success'
  }
  if (status === 'starting' || status === 'provisioned') {
    return 'primary'
  }
  if (status === 'stopping') {
    return 'warning'
  }
  if (status === 'error') {
    return 'danger'
  }
  return 'neutral'
}

export function CloudPhonesView({
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
  activeSheetTab,
  setActiveSheetTab,
  onCreate,
  onBulkStart,
  onBulkStop,
  onBulkAssignGroup,
  onBulkDelete,
  onEdit,
  onLoadDetails,
  onStop,
  onStart,
  onCloseEditor,
  onSave,
  onDelete,
  onUpdateProvider,
  onUpdateProxyRefMode,
  onTestProxy,
}: {
  locale: string
  t: Dictionary
  cloudPhoneSearchQuery: string
  setCloudPhoneSearchQuery: Dispatch<SetStateAction<string>>
  cloudPhoneGroupFilter: string
  setCloudPhoneGroupFilter: Dispatch<SetStateAction<string>>
  cloudPhoneGroupOptions: string[]
  defaultCloudPhoneProviderHealth: CloudPhoneProviderHealth | null
  defaultCloudPhoneProvider: string
  renderProviderLabel: (providerKey: string) => string
  selectedCloudPhoneIds: string[]
  toggleCloudPhoneSelection: (cloudPhoneId: string) => void
  cloudPhoneBatchGroupName: string
  setCloudPhoneBatchGroupName: Dispatch<SetStateAction<string>>
  filteredCloudPhones: CloudPhoneRecord[]
  groupedCloudPhones: Record<string, CloudPhoneRecord[]>
  proxies: ProxyRecord[]
  showCloudPhoneEditor: boolean
  selectedCloudPhoneId: string | null
  cloudPhoneForm: CreateCloudPhoneInput
  setCloudPhoneForm: Dispatch<SetStateAction<CreateCloudPhoneInput>>
  cloudPhoneProviders: CloudPhoneProviderSummary[]
  cloudPhoneProviderHealthMap: Map<string, CloudPhoneProviderHealth>
  localEmulatorDevices: DetectedLocalEmulator[]
  settings: SettingsPayload
  defaultEnvironmentLanguage: string
  cloudPhoneDetails: CloudPhoneDetails | null
  activeSheetTab: CloudPhoneSheetTab
  setActiveSheetTab: Dispatch<SetStateAction<CloudPhoneSheetTab>>
  onCreate: () => void
  onBulkStart: () => void
  onBulkStop: () => void
  onBulkAssignGroup: () => void
  onBulkDelete: () => void
  onEdit: (cloudPhoneId: string) => void
  onLoadDetails: (cloudPhoneId: string) => void
  onStop: (cloudPhoneId: string) => void
  onStart: (cloudPhoneId: string) => void
  onCloseEditor: () => void
  onSave: () => void
  onDelete: () => void
  onUpdateProvider: (providerKey: string) => void
  onUpdateProxyRefMode: (proxyRefMode: CloudPhoneProxyRefMode) => void
  onTestProxy: () => void
}) {
  const pointerActionRef = useRef<string | null>(null)
  const copy =
    locale === 'zh-CN'
      ? {
          description: '用分组卡片和右侧编辑 Sheet 管理云手机环境，批量操作也保留。',
          emptyTitle: '还没有云手机环境',
          tabs: {
            base: '基础',
            network: '网络',
            fingerprint: '指纹',
          },
          savedProxy: '已保存代理',
          customProxy: '自定义代理',
          selectSavedProxy: '请选择已保存代理',
          usingSavedProxy: (details: string) => `当前引用代理：${details}`,
          close: '关闭',
        }
      : {
          description: 'Manage cloud phone environments with grouped cards and a right-side editing sheet.',
          emptyTitle: 'No cloud phones yet',
          tabs: {
            base: 'Base',
            network: 'Network',
            fingerprint: 'Fingerprint',
          },
          savedProxy: 'Saved proxy',
          customProxy: 'Custom proxy',
          selectSavedProxy: 'Select a saved proxy',
          usingSavedProxy: (details: string) => `Using saved proxy: ${details}`,
          close: 'Close',
        }
  const selectedSavedProxy = resolveSelectedProxy(proxies, cloudPhoneForm.proxyId)

  function bindPointerAction(actionKey: string, action: () => void) {
    return {
      onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0) {
          return
        }
        pointerActionRef.current = actionKey
        event.preventDefault()
        action()
      },
      onClick: () => {
        if (pointerActionRef.current === actionKey) {
          pointerActionRef.current = null
          return
        }
        action()
      },
    }
  }

  return (
    <section className="space-y-6">
      <Card className="rounded-[28px] border border-slate-200 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="m-0 text-xl font-semibold text-slate-950">{t.cloudPhones.title}</h2>
            <p className="mt-1 mb-0 text-sm text-slate-500">{copy.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" onClick={onCreate}>
              {t.cloudPhones.create}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="rounded-[24px] border border-slate-200 shadow-none">
        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,1.4fr)_220px]">
          <Input
            value={cloudPhoneSearchQuery}
            onChange={(event) => setCloudPhoneSearchQuery(event.target.value)}
            placeholder={`${t.common.search}...`}
          />
          <Select
            value={cloudPhoneGroupFilter}
            onChange={(event) => setCloudPhoneGroupFilter(event.target.value)}
          >
            <option value="all">{t.profiles.groupFilter}: {t.common.all}</option>
            {cloudPhoneGroupOptions.map((groupName) => (
              <option key={groupName} value={groupName}>
                {groupName}
              </option>
            ))}
          </Select>
        </div>
        {defaultCloudPhoneProviderHealth ? (
          <div className="border-t border-slate-100 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={defaultCloudPhoneProviderHealth.available ? 'success' : 'warning'}>
                {t.cloudPhones.defaultProvider}: {renderProviderLabel(defaultCloudPhoneProvider)}
              </Badge>
              <span className="text-sm text-slate-500">{defaultCloudPhoneProviderHealth.message}</span>
            </div>
          </div>
        ) : null}
      </Card>

      <Card className="rounded-[24px] border border-slate-200 shadow-none">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <span className="mr-2 text-sm font-medium text-slate-700">
            {t.cloudPhones.selectedCount(selectedCloudPhoneIds.length)}
          </span>
          <Button disabled={selectedCloudPhoneIds.length === 0} onClick={onBulkStart}>
            {t.cloudPhones.batchStart}
          </Button>
          <Button variant="secondary" disabled={selectedCloudPhoneIds.length === 0} onClick={onBulkStop}>
            {t.cloudPhones.batchStop}
          </Button>
          <div className="min-w-[200px] flex-1">
            <Input
              value={cloudPhoneBatchGroupName}
              onChange={(event) => setCloudPhoneBatchGroupName(event.target.value)}
              placeholder={t.profiles.group}
            />
          </div>
          <Button
            variant="secondary"
            disabled={selectedCloudPhoneIds.length === 0 || cloudPhoneBatchGroupName.trim().length === 0}
            onClick={onBulkAssignGroup}
          >
            {t.cloudPhones.batchAssignGroup}
          </Button>
          <Button variant="danger" disabled={selectedCloudPhoneIds.length === 0} onClick={onBulkDelete}>
            {t.cloudPhones.batchDelete}
          </Button>
        </div>
      </Card>

      {!showCloudPhoneEditor && filteredCloudPhones.length > 0 ? (
        <div className="space-y-4">
          {Object.entries(groupedCloudPhones).map(([groupName, items]) => (
            <Card key={groupName} className="rounded-[28px] border border-slate-200 shadow-none">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="text-base font-semibold text-slate-950">{groupName}</div>
                <Badge tone="neutral">{items.length}</Badge>
              </div>
              <div className="divide-y divide-slate-100">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-4 px-5 py-4 xl:grid-cols-[28px_minmax(0,1.4fr)_220px_220px_auto] xl:items-center"
                  >
                    <Checkbox
                      checked={selectedCloudPhoneIds.includes(item.id)}
                      onChange={() => toggleCloudPhoneSelection(item.id)}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-semibold text-slate-950">{item.name}</div>
                        <Badge tone="primary">{renderProviderLabel(item.providerKey)}</Badge>
                        <Badge tone="neutral">{item.computeType}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-slate-500">
                        {item.groupName || t.profiles.groupFallback} · {item.tags.join(', ') || t.common.noTags}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {t.cloudPhones.provider}: {renderProviderLabel(item.providerKey)} · {t.cloudPhones.computeType}:{' '}
                        {item.computeType}
                      </div>
                    </div>
                    <div className="text-sm text-slate-500">
                      <div>
                        {item.proxyRefMode === 'saved'
                          ? (resolveSelectedProxy(proxies, item.proxyId)?.name ?? t.common.noProxy)
                          : item.proxyHost || t.common.noProxy}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">{item.ipLookupChannel || '-'}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={getCloudPhoneStatusTone(item.status)}>
                        {t.cloudPhones.statusLabel(item.status)}
                      </Badge>
                      {item.lastSyncedAt ? (
                        <span className="text-xs text-slate-400">{new Date(item.lastSyncedAt).toLocaleString(locale)}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="ghost" onClick={() => onEdit(item.id)}>
                        {t.common.edit}
                      </Button>
                      <Button variant="ghost" onClick={() => onLoadDetails(item.id)}>
                        {t.cloudPhones.details}
                      </Button>
                      {item.status === 'running' || item.status === 'starting' ? (
                        <Button variant="danger" onClick={() => onStop(item.id)}>
                          {t.common.stop}
                        </Button>
                      ) : (
                        <Button variant="primary" onClick={() => onStart(item.id)}>
                          {t.common.launch}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : !showCloudPhoneEditor ? (
        <EmptyState
          title={copy.emptyTitle}
          description={t.cloudPhones.empty}
          actionLabel={t.cloudPhones.create}
          onAction={onCreate}
        />
      ) : null}

      <Sheet open={showCloudPhoneEditor}>
        <SheetOverlay onClick={onCloseEditor} />
        <SheetContent className="max-w-[460px]">
          <SheetHeader>
            <SheetTitle>{selectedCloudPhoneId ? t.cloudPhones.edit : t.cloudPhones.create}</SheetTitle>
          </SheetHeader>

          <div className="border-b border-slate-200 px-5 py-4">
            <Tabs value={activeSheetTab} onValueChange={(value) => setActiveSheetTab(value as CloudPhoneSheetTab)}>
              <TabsList>
                <TabsTrigger value="base">{copy.tabs.base}</TabsTrigger>
                <TabsTrigger value="network">{copy.tabs.network}</TabsTrigger>
                <TabsTrigger value="fingerprint">{copy.tabs.fingerprint}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="duokai-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
            <Tabs value={activeSheetTab} onValueChange={(value) => setActiveSheetTab(value as CloudPhoneSheetTab)}>
              <TabsContent value="base" className="space-y-5">
                <div className="space-y-4">
                  <div className="text-sm font-medium text-slate-500">{t.cloudPhones.providerSettings}</div>
                  <Select value={cloudPhoneForm.providerKey} onChange={(event) => onUpdateProvider(event.target.value)}>
                    {cloudPhoneProviders.map((provider) => (
                      <option key={provider.key} value={provider.key}>
                        {provider.label}
                      </option>
                    ))}
                  </Select>
                  {cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey) ? (
                    <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                      <div className="font-medium text-slate-700">{renderProviderLabel(cloudPhoneForm.providerKey)}</div>
                      <div className="mt-2">
                        {cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey)?.available
                          ? t.common.ready
                          : t.common.missing}
                        {' · '}
                        {cloudPhoneProviderHealthMap.get(cloudPhoneForm.providerKey)?.message}
                      </div>
                    </div>
                  ) : null}
                  <Select
                    value={cloudPhoneForm.computeType}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        computeType: event.target.value as CreateCloudPhoneInput['computeType'],
                      }))
                    }
                  >
                    <option value="basic">{t.cloudPhones.computeBasic}</option>
                    <option value="standard">{t.cloudPhones.computeStandard}</option>
                    <option value="pro">{t.cloudPhones.computePro}</option>
                  </Select>
                </div>

                <div className="space-y-4">
                  <div className="text-sm font-medium text-slate-500">{t.profiles.title}</div>
                  <Input
                    value={cloudPhoneForm.name}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder={t.profiles.name}
                  />
                  <Input
                    value={cloudPhoneForm.tags.join(', ')}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        tags: event.target.value
                          .split(',')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder={t.profiles.tagsPlaceholder}
                  />
                  <Input
                    value={cloudPhoneForm.groupName}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({ ...current, groupName: event.target.value }))
                    }
                    placeholder={t.profiles.group}
                  />
                  <Textarea
                    rows={3}
                    value={cloudPhoneForm.notes}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    placeholder={t.profiles.notes}
                  />
                </div>
              </TabsContent>

              <TabsContent value="network" className="space-y-5">
                <div className="space-y-4">
                  <div className="text-sm font-medium text-slate-500">{t.proxies.title}</div>
                  {cloudPhoneForm.providerKey === 'self-hosted' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
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
                        placeholder={t.cloudPhones.baseUrl}
                      />
                      <Input
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
                        placeholder={t.cloudPhones.clusterId}
                      />
                    </div>
                  ) : null}
                  {cloudPhoneForm.providerKey === 'third-party' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
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
                        placeholder={t.cloudPhones.vendorKey}
                      />
                      <Input
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
                        placeholder={t.cloudPhones.baseUrl}
                      />
                    </div>
                  ) : null}
                  {cloudPhoneForm.providerKey === 'local-emulator' ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Select
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
                      </Select>
                      <Input
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
                        placeholder={t.cloudPhones.adbPath}
                      />
                    </div>
                  ) : null}
                  <Input
                    value={cloudPhoneForm.ipLookupChannel}
                    onChange={(event) =>
                      setCloudPhoneForm((current) => ({
                        ...current,
                        ipLookupChannel: event.target.value,
                      }))
                    }
                    placeholder={t.cloudPhones.ipLookupChannel}
                  />
                  <Select
                    value={cloudPhoneForm.proxyRefMode}
                    onChange={(event) => onUpdateProxyRefMode(event.target.value as CloudPhoneProxyRefMode)}
                  >
                    <option value="saved">{copy.savedProxy}</option>
                    <option value="custom">{copy.customProxy}</option>
                  </Select>
                  {cloudPhoneForm.proxyRefMode === 'saved' ? (
                    <>
                      <Select
                        value={cloudPhoneForm.proxyId ?? ''}
                        onChange={(event) =>
                          setCloudPhoneForm((current) => ({
                            ...current,
                            proxyId: event.target.value || null,
                          }))
                        }
                      >
                        <option value="">{copy.selectSavedProxy}</option>
                        {proxies.map((proxy) => (
                          <option key={proxy.id} value={proxy.id}>
                            {proxy.name} · {proxy.type.toUpperCase()} {proxy.host}:{proxy.port}
                          </option>
                        ))}
                      </Select>
                      {selectedSavedProxy ? (
                        <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                          {copy.usingSavedProxy(
                            `${selectedSavedProxy.name} · ${selectedSavedProxy.type.toUpperCase()} ${selectedSavedProxy.host}:${selectedSavedProxy.port}`,
                          )}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <Select
                          value={cloudPhoneForm.proxyType}
                          onChange={(event) =>
                            setCloudPhoneForm((current) => ({
                              ...current,
                              proxyType: event.target.value as CreateCloudPhoneInput['proxyType'],
                            }))
                          }
                        >
                          <option value="socks5">SOCKS5</option>
                          <option value="http">HTTP</option>
                          <option value="https">HTTPS</option>
                        </Select>
                        <Select
                          value={cloudPhoneForm.ipProtocol}
                          onChange={(event) =>
                            setCloudPhoneForm((current) => ({
                              ...current,
                              ipProtocol: event.target.value as CreateCloudPhoneInput['ipProtocol'],
                            }))
                          }
                        >
                          <option value="ipv4">{t.cloudPhones.protocolIpv4}</option>
                          <option value="ipv6">{t.cloudPhones.protocolIpv6}</option>
                        </Select>
                      </div>
                      <Input
                        value={cloudPhoneForm.proxyHost}
                        onChange={(event) =>
                          setCloudPhoneForm((current) => ({ ...current, proxyHost: event.target.value }))
                        }
                        placeholder={t.cloudPhones.proxyHost}
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          type="number"
                          value={cloudPhoneForm.proxyPort || ''}
                          onChange={(event) =>
                            setCloudPhoneForm((current) => ({
                              ...current,
                              proxyPort: Number(event.target.value),
                            }))
                          }
                          placeholder={t.cloudPhones.proxyPort}
                        />
                        <Select
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
                        </Select>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <Input
                          value={cloudPhoneForm.proxyUsername}
                          onChange={(event) =>
                            setCloudPhoneForm((current) => ({
                              ...current,
                              proxyUsername: event.target.value,
                            }))
                          }
                          placeholder={t.cloudPhones.proxyUsername}
                        />
                        <Input
                          type="password"
                          value={cloudPhoneForm.proxyPassword}
                          onChange={(event) =>
                            setCloudPhoneForm((current) => ({
                              ...current,
                              proxyPassword: event.target.value,
                            }))
                          }
                          placeholder={t.cloudPhones.proxyPassword}
                        />
                      </div>
                    </div>
                  )}
                  <Button variant="secondary" onClick={onTestProxy}>
                    {t.cloudPhones.testProxy}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="fingerprint" className="space-y-5">
                <div className="space-y-4">
                  <div className="text-sm font-medium text-slate-500">{t.cloudPhones.fingerprint}</div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Select
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
                    </Select>
                    <Select
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
                    </Select>
                    <Select
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
                    </Select>
                  </div>
                  {!cloudPhoneForm.fingerprintSettings.autoLanguage ? (
                    <Select
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
                    </Select>
                  ) : null}
                  {!cloudPhoneForm.fingerprintSettings.autoTimezone ? (
                    <Input
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
                      placeholder={t.profiles.timezone}
                    />
                  ) : null}
                  {!cloudPhoneForm.fingerprintSettings.autoGeolocation ? (
                    <Input
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
                      placeholder={t.cloudPhones.geolocation}
                    />
                  ) : null}
                </div>

                {cloudPhoneDetails ? (
                  <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    <div className="font-medium text-slate-700">{t.cloudPhones.details}</div>
                    <p className="mt-2 mb-0">{cloudPhoneDetails.message}</p>
                    <p className="mt-2 mb-0">{cloudPhoneDetails.endpointUrl ?? t.common.missing}</p>
                    <p className="mt-2 mb-0">{cloudPhoneDetails.connectionLabel ?? t.common.missing}</p>
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <Button variant="ghost" {...bindPointerAction('close-cloud-phone-editor', onCloseEditor)}>
              {copy.close}
            </Button>
            <div className="flex items-center gap-2">
              {selectedCloudPhoneId ? (
                <Button variant="danger" {...bindPointerAction('delete-cloud-phone', onDelete)}>
                  {t.common.delete}
                </Button>
              ) : null}
              <Button variant="primary" {...bindPointerAction('save-cloud-phone', onSave)}>
                {selectedCloudPhoneId ? t.busy.updateCloudPhone : t.cloudPhones.create}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
