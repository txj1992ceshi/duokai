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

  return (
    <>
      {errorMessage ? <div className="banner error">{errorMessage}</div> : null}
      {syncWarningMessage ? <div className="banner warning">{syncWarningMessage}</div> : null}
      {agentReadOnlyMessage ? <div className="banner warning">{agentReadOnlyMessage}</div> : null}
      {updateState &&
      (updateState.status === 'available' ||
        updateState.status === 'downloading' ||
        updateState.status === 'downloaded') ? (
        <div className="banner info updater-banner">
          <div>
            <strong>
              {desktopT('shell.updateTitle', { version: updateState.latestVersion || '' })}
            </strong>
            <p>{describeUpdateStatus(updateState)}</p>
          </div>
          <div className="updater-banner-actions">
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
            <div className="text-xs text-slate-500">
              {desktopT('shell.environmentTabsHint')}
            </div>
          </div>
        </Card>
      ) : null}
    </>
  )
}
