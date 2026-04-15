import { Button, Card } from '@duokai/ui'
import i18nClient from '../lib/i18n-client'
import type { DesktopUpdateState } from '../shared/types'
import type { MainNavKey } from '../layouts/MainLayout'

type EnvironmentCenterTab = {
  key: 'dashboard' | 'profiles' | 'cloudPhones'
  label: string
}

export function DesktopWorkspaceChrome({
  locale,
  errorMessage,
  syncWarningMessage,
  agentReadOnlyMessage,
  updateState,
  describeUpdateStatus,
  getUpdateActionLabel,
  onPrimaryUpdateAction,
  onOpenReleasePage,
  view,
  mainSection,
  environmentCenterTabs,
  onSelectEnvironmentTab,
}: {
  locale: string
  errorMessage: string
  syncWarningMessage: string
  agentReadOnlyMessage: string
  updateState: DesktopUpdateState | null
  describeUpdateStatus: (state: DesktopUpdateState | null) => string
  getUpdateActionLabel: (state: DesktopUpdateState | null) => string
  onPrimaryUpdateAction: () => void
  onOpenReleasePage: () => void
  view: 'dashboard' | 'profiles' | 'cloudPhones' | 'proxies' | 'logs' | 'settings' | 'account'
  mainSection: MainNavKey
  environmentCenterTabs: EnvironmentCenterTab[]
  onSelectEnvironmentTab: (key: EnvironmentCenterTab['key']) => void
}) {
  const desktopT = i18nClient.getFixedT(locale, 'desktop')
  const hasTopBanners = Boolean(errorMessage || syncWarningMessage || agentReadOnlyMessage || (
    updateState &&
    (updateState.status === 'available' ||
      updateState.status === 'downloading' ||
      updateState.status === 'downloaded')
  ))

  return (
    <>
      {hasTopBanners ? (
        <div className="mb-6 space-y-3">
          {errorMessage ? (
            <div className="flex min-h-[54px] items-center rounded-[22px] border px-5 py-4 text-sm font-medium shadow-sm border-[var(--duokai-banner-error-border)] bg-[var(--duokai-banner-error-bg)] text-[var(--duokai-banner-error-text)]">
              {errorMessage}
            </div>
          ) : null}
          {syncWarningMessage ? (
            <div className="flex min-h-[54px] items-center rounded-[22px] border px-5 py-4 text-sm font-medium shadow-sm border-[var(--duokai-banner-warning-border)] bg-[var(--duokai-banner-warning-bg)] text-[var(--duokai-banner-warning-text)]">
              {syncWarningMessage}
            </div>
          ) : null}
          {agentReadOnlyMessage ? (
            <div className="flex min-h-[54px] items-center rounded-[22px] border px-5 py-4 text-sm font-medium shadow-sm border-[var(--duokai-banner-warning-border)] bg-[var(--duokai-banner-warning-bg)] text-[var(--duokai-banner-warning-text)]">
              {agentReadOnlyMessage}
            </div>
          ) : null}
          {updateState &&
          (updateState.status === 'available' ||
            updateState.status === 'downloading' ||
            updateState.status === 'downloaded') ? (
            <div className="flex flex-col gap-4 rounded-[22px] border px-5 py-4 shadow-sm border-[var(--duokai-banner-info-border)] bg-[var(--duokai-banner-info-bg)] text-[var(--duokai-banner-info-text)] md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <strong className="block text-sm font-semibold">
                  {desktopT('shell.updateTitle', { version: updateState.latestVersion || '' })}
                </strong>
                <p className="mt-1 text-sm opacity-80">
                  {describeUpdateStatus(updateState)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:flex-nowrap">
                <button
                  type="button"
                  className="primary"
                  onClick={onPrimaryUpdateAction}
                  disabled={updateState.status === 'downloading'}
                >
                  {getUpdateActionLabel(updateState)}
                </button>
                <button type="button" className="secondary-button" onClick={onOpenReleasePage}>
                  {desktopT('shell.releasePage')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {['dashboard', 'profiles', 'cloudPhones'].includes(view) && mainSection === 'environmentCenter' ? (
        <Card className="mb-6 rounded-[24px] border border-slate-200 shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {environmentCenterTabs.map((item) => (
                <Button
                  key={item.key}
                  variant={view === item.key ? 'primary' : 'ghost'}
                  onClick={() => onSelectEnvironmentTab(item.key)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            {desktopT('shell.environmentTabsHint') ? (
              <div className="text-xs text-slate-500">
                {desktopT('shell.environmentTabsHint')}
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}
    </>
  )
}
