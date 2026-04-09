import { useState, type Dispatch, type SetStateAction } from 'react'
import { Button, Card, Input, Select, Textarea } from '@duokai/ui'
import type { Dictionary } from '../i18n'
import i18nClient from '../lib/i18n-client'
import { SUPPORTED_ENVIRONMENT_LANGUAGES } from '../shared/environmentLanguages'
import type {
  CloudPhoneProviderHealth,
  CloudPhoneProviderSummary,
  DesktopRuntimeInfo,
  DesktopUpdateState,
  DetectedLocalEmulator,
  ImportResult,
  SettingsPayload,
} from '../shared/types'

export function SettingsView({
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
  updateState,
  rendererOperatingSystem,
  appVersion,
  renderProviderLabel,
  formatDate,
  describeUpdateStatus,
  getUpdateActionLabel,
  onSave,
  onExportBundle,
  onImportBundle,
  onPrimaryUpdateAction,
  onCheckForUpdates,
  onOpenReleasePage,
}: {
  locale: string
  t: Dictionary
  settings: SettingsPayload
  setSettings: Dispatch<SetStateAction<SettingsPayload>>
  onChangeUiLanguage?: (nextLanguage: 'zh-CN' | 'en-US') => void | Promise<void>
  onChangeThemeMode?: (nextThemeMode: 'light' | 'dark' | 'system') => void | Promise<void>
  defaultEnvironmentLanguage: string
  cloudPhoneProviders: CloudPhoneProviderSummary[]
  defaultCloudPhoneProvider: string
  cloudPhoneProviderHealth: CloudPhoneProviderHealth[]
  localEmulatorDevices: DetectedLocalEmulator[]
  importResult: ImportResult | null
  directoryInfo: {
    appDataDir: string
    profilesDir: string
    chromiumExecutable?: string
  } | null
  runtimeInfo: DesktopRuntimeInfo | null
  updateState: DesktopUpdateState | null
  rendererOperatingSystem: string
  appVersion: string
  renderProviderLabel: (providerKey: string) => string
  formatDate: (value: string | null) => string
  describeUpdateStatus: (state: DesktopUpdateState | null) => string
  getUpdateActionLabel: (state: DesktopUpdateState | null) => string
  onSave: () => void
  onExportBundle: () => void
  onImportBundle: () => void
  onPrimaryUpdateAction: () => void
  onCheckForUpdates: () => void
  onOpenReleasePage: () => void
}) {
  const desktopT = i18nClient.getFixedT(locale, 'desktop')
  const [capabilitiesExpanded, setCapabilitiesExpanded] = useState(false)
  const capabilityList = runtimeInfo?.capabilities ?? []

  return (
    <section className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="self-start rounded-[28px] border border-slate-200 shadow-none">
          <div className="space-y-4 p-5">
            <div>
              <h2 className="m-0 text-xl font-semibold text-slate-950">{t.settings.title}</h2>
              <p className="mt-1 mb-0 text-sm text-slate-500">
                {desktopT('settings.profileDescription')}
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-[var(--duokai-surface)] p-1">
                <div className="grid grid-cols-2 gap-1">
                  <Button
                    variant={(settings.uiLanguage ?? 'zh-CN') === 'zh-CN' ? 'primary' : 'ghost'}
                    onClick={() =>
                      onChangeUiLanguage
                        ? void onChangeUiLanguage('zh-CN')
                        : setSettings((current) => ({
                            ...current,
                            uiLanguage: 'zh-CN',
                          }))
                    }
                  >
                    {t.settings.languageZh}
                  </Button>
                  <Button
                    variant={(settings.uiLanguage ?? 'zh-CN') === 'en-US' ? 'primary' : 'ghost'}
                    onClick={() =>
                      onChangeUiLanguage
                        ? void onChangeUiLanguage('en-US')
                        : setSettings((current) => ({
                            ...current,
                            uiLanguage: 'en-US',
                          }))
                    }
                  >
                    {t.settings.languageEn}
                  </Button>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-[var(--duokai-surface)] p-1">
                <div className="grid grid-cols-3 gap-1">
                  <Button
                    variant={(settings.themeMode ?? 'system') === 'light' ? 'primary' : 'ghost'}
                    onClick={() =>
                      onChangeThemeMode
                        ? void onChangeThemeMode('light')
                        : setSettings((current) => ({
                            ...current,
                            themeMode: 'light',
                          }))
                    }
                  >
                    {t.settings.themeLight}
                  </Button>
                  <Button
                    variant={(settings.themeMode ?? 'system') === 'dark' ? 'primary' : 'ghost'}
                    onClick={() =>
                      onChangeThemeMode
                        ? void onChangeThemeMode('dark')
                        : setSettings((current) => ({
                            ...current,
                            themeMode: 'dark',
                          }))
                    }
                  >
                    {t.settings.themeDark}
                  </Button>
                  <Button
                    variant={(settings.themeMode ?? 'system') === 'system' ? 'primary' : 'ghost'}
                    onClick={() =>
                      onChangeThemeMode
                        ? void onChangeThemeMode('system')
                        : setSettings((current) => ({
                            ...current,
                            themeMode: 'system',
                          }))
                    }
                  >
                    {t.settings.themeSystem}
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Select
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
              </Select>
            </div>
            <Input
              value={settings.controlPlaneApiBase ?? ''}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  controlPlaneApiBase: event.target.value,
                }))
              }
              placeholder="http://duokai.duckdns.org"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={settings.workspaceName ?? ''}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    workspaceName: event.target.value,
                  }))
                }
                placeholder={t.settings.workspaceName}
              />
              <Input
                value={settings.defaultHomePage ?? ''}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    defaultHomePage: event.target.value,
                  }))
                }
                placeholder={t.settings.defaultHomePage}
              />
            </div>
            <Textarea
              rows={5}
              value={settings.notes ?? ''}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              placeholder={t.settings.notes}
            />
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="self-start rounded-[28px] border border-slate-200 shadow-none">
            <div className="space-y-4 p-5">
              <div>
                <div className="text-sm font-medium text-slate-500">{desktopT('settings.runtimeLimitsTitle')}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {desktopT('settings.runtimeLimitsDescription')}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Input
                  type="number"
                  min={1}
                  value={settings.runtimeMaxConcurrentStarts ?? '2'}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      runtimeMaxConcurrentStarts: event.target.value,
                    }))
                  }
                  placeholder={t.settings.runtimeMaxConcurrentStarts}
                />
                <Input
                  type="number"
                  min={1}
                  value={settings.runtimeMaxActiveProfiles ?? '6'}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      runtimeMaxActiveProfiles: event.target.value,
                    }))
                  }
                  placeholder={t.settings.runtimeMaxActiveProfiles}
                />
                <Input
                  type="number"
                  min={0}
                  value={settings.runtimeMaxLaunchRetries ?? '2'}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      runtimeMaxLaunchRetries: event.target.value,
                    }))
                  }
                  placeholder={t.settings.runtimeMaxLaunchRetries}
                />
              </div>
              <Button className="w-fit" variant="primary" onClick={onSave}>
                {t.settings.save}
              </Button>
            </div>
          </Card>

          <Card className="self-start rounded-[28px] border border-slate-200 shadow-none">
            <div className="space-y-4 p-5">
              <div>
                <div className="text-sm font-medium text-slate-500">{t.settings.dataTools}</div>
                <div className="mt-1 text-sm text-slate-500">
                  {desktopT('settings.dataToolsDescription')}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="secondary" onClick={onExportBundle}>
                  {t.settings.exportBundle}
                </Button>
                <Button variant="secondary" onClick={onImportBundle}>
                  {t.settings.importBundle}
                </Button>
              </div>
              {importResult ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="font-medium text-slate-700">{t.settings.importResult}</div>
                  <p className="mt-2 mb-0">{t.common.importSummary(importResult)}</p>
                  {importResult.warnings.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {importResult.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Card className="rounded-[28px] border border-slate-200 shadow-none">
          <div className="space-y-5 p-5">
            <div>
              <div className="text-sm font-medium text-slate-500">{t.settings.cloudPhoneProviders}</div>
              <div className="mt-1 text-sm text-slate-500">
                {desktopT('settings.providersDescription')}
              </div>
            </div>
            <Select
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
            </Select>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={settings.selfHostedCloudPhoneBaseUrl ?? ''}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    selfHostedCloudPhoneBaseUrl: event.target.value,
                  }))
                }
                placeholder={t.settings.selfHostedBaseUrl}
              />
              <Input
                type="password"
                value={settings.selfHostedCloudPhoneApiKey ?? ''}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    selfHostedCloudPhoneApiKey: event.target.value,
                  }))
                }
                placeholder={t.settings.selfHostedApiKey}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={settings.selfHostedCloudPhoneClusterId ?? ''}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    selfHostedCloudPhoneClusterId: event.target.value,
                  }))
                }
                placeholder={t.settings.selfHostedClusterId}
              />
              <Input
                value={settings.thirdPartyCloudPhoneVendor ?? ''}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    thirdPartyCloudPhoneVendor: event.target.value,
                  }))
                }
                placeholder={t.settings.thirdPartyVendor}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                value={settings.thirdPartyCloudPhoneBaseUrl ?? ''}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    thirdPartyCloudPhoneBaseUrl: event.target.value,
                  }))
                }
                placeholder={t.settings.thirdPartyBaseUrl}
              />
              <Input
                type="password"
                value={settings.thirdPartyCloudPhoneToken ?? ''}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    thirdPartyCloudPhoneToken: event.target.value,
                  }))
                }
                placeholder={t.settings.thirdPartyToken}
              />
            </div>
            <Input
              value={settings.localEmulatorAdbPath ?? 'adb'}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  localEmulatorAdbPath: event.target.value,
                }))
              }
              placeholder={t.settings.localEmulatorAdbPath}
            />
            <div className="rounded-2xl bg-slate-50 p-4">
              <div className="text-sm font-medium text-slate-700">{t.settings.providerHealth}</div>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {cloudPhoneProviderHealth.map((provider) => (
                  <li key={provider.key}>
                    {renderProviderLabel(provider.key)}: {provider.available ? t.common.ready : t.common.missing} ·{' '}
                    {provider.message}
                  </li>
                ))}
              </ul>
            </div>
            {localEmulatorDevices.length > 0 ? (
              <div className="rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-medium text-slate-700">{t.settings.localDevices}</div>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  {localEmulatorDevices.map((device) => (
                    <li key={device.serial}>
                      {device.name} ({device.serial}) · {device.state}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[28px] border border-slate-200 shadow-none">
            <div className="space-y-4 p-5">
              <div className="text-sm font-medium text-slate-500">{t.settings.runtimePaths}</div>
              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{t.settings.appData}</div>
                  <div className="mt-1 text-sm text-slate-700">{directoryInfo?.appDataDir ?? t.common.loading}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{t.settings.profiles}</div>
                  <div className="mt-1 text-sm text-slate-700">{directoryInfo?.profilesDir ?? t.common.loading}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{t.settings.chromiumBinary}</div>
                  <div className="mt-1 text-sm text-slate-700">
                    {directoryInfo?.chromiumExecutable ?? t.settings.missingChromium}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="rounded-[28px] border border-slate-200 shadow-none">
            <div className="space-y-4 p-5">
              <div className="text-sm font-medium text-slate-500">{t.settings.runtimeInfo}</div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  [t.settings.runtimeMode, runtimeInfo?.mode ?? t.common.loading],
                  [t.settings.mainVersion, runtimeInfo?.mainVersion ?? t.common.loading],
                  [t.settings.preloadVersion, runtimeInfo?.preloadVersion ?? t.common.loading],
                  [t.settings.rendererVersion, runtimeInfo?.rendererVersion ?? appVersion],
                  [t.settings.buildMarker, runtimeInfo?.buildMarker ?? t.common.loading],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-2xl border border-slate-200 px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{label}</div>
                    <div className="mt-1 text-sm text-slate-700">{value}</div>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-[0.12em] text-slate-400">{t.settings.capabilities}</div>
                    <div className="mt-1 text-sm text-slate-700">
                      {capabilityList.length > 0
                        ? `${capabilityList.slice(0, 6).join(', ')}${capabilityList.length > 6 ? '...' : ''}`
                        : t.common.loading}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setCapabilitiesExpanded((current) => !current)}>
                    {capabilitiesExpanded ? '收起' : '详情'}
                  </Button>
                </div>
                {capabilitiesExpanded ? (
                  <div className="mt-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                    {capabilityList.join(', ') || t.common.loading}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>

          <Card className="rounded-[28px] border border-slate-200 shadow-none">
            <div className="space-y-4 p-5">
              <div>
                <div className="text-sm font-medium text-slate-500">{desktopT('settings.updates.title')}</div>
                <div className="mt-1 text-sm text-slate-500">{describeUpdateStatus(updateState)}</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                    {desktopT('settings.updates.currentVersion')}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{runtimeInfo?.appVersion ?? appVersion}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                    {desktopT('settings.updates.latestVersion')}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">{updateState?.latestVersion || '-'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                    {desktopT('settings.updates.publishedAt')}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    {updateState?.publishedAt ? formatDate(updateState.publishedAt) : t.common.never}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.12em] text-slate-400">
                    {desktopT('settings.updates.lastChecked')}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    {updateState?.checkedAt ? formatDate(updateState.checkedAt) : t.common.never}
                  </div>
                </div>
              </div>
              {updateState?.downloadedFile ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  {desktopT('settings.updates.downloadedTo', { path: updateState.downloadedFile })}
                </div>
              ) : null}
              {rendererOperatingSystem === 'macOS' ? (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  {desktopT('settings.updates.macOsHint')}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  onClick={onPrimaryUpdateAction}
                  disabled={updateState?.status === 'downloading'}
                >
                  {getUpdateActionLabel(updateState)}
                </Button>
                <Button variant="secondary" onClick={onCheckForUpdates}>
                  {desktopT('settings.updates.checkAgain')}
                </Button>
                <Button variant="secondary" onClick={onOpenReleasePage}>
                  {desktopT('settings.updates.openReleasePage')}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
