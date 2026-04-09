import type { ComponentProps } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AccountView } from './AccountView'
import { CloudPhonesView } from './CloudPhonesView'
import { DashboardView } from './DashboardView'
import { DesktopWorkspaceChrome } from './DesktopWorkspaceChrome'
import { LogsView } from './LogsView'
import { ProfilesView } from './ProfilesView'
import { ProxiesView } from './ProxiesView'
import { SettingsView } from './SettingsView'
import { PAGE_TRANSITION, PAGE_VIEW_VARIANTS } from '../lib/motion'

export type DesktopWorkspaceViewKey =
  | 'dashboard'
  | 'profiles'
  | 'cloudPhones'
  | 'proxies'
  | 'logs'
  | 'settings'
  | 'account'

export function DesktopWorkspaceViews({
  view,
  shellProps,
  dashboardProps,
  profilesProps,
  cloudPhonesProps,
  proxiesProps,
  logsProps,
  settingsProps,
  accountProps,
}: {
  view: DesktopWorkspaceViewKey
  shellProps: ComponentProps<typeof DesktopWorkspaceChrome>
  dashboardProps: ComponentProps<typeof DashboardView>
  profilesProps: ComponentProps<typeof ProfilesView>
  cloudPhonesProps: ComponentProps<typeof CloudPhonesView>
  proxiesProps: ComponentProps<typeof ProxiesView>
  logsProps: ComponentProps<typeof LogsView>
  settingsProps: ComponentProps<typeof SettingsView>
  accountProps: ComponentProps<typeof AccountView>
}) {
  const viewContent =
    view === 'dashboard' ? <DashboardView {...dashboardProps} /> :
    view === 'profiles' ? <ProfilesView {...profilesProps} /> :
    view === 'cloudPhones' ? <CloudPhonesView {...cloudPhonesProps} /> :
    view === 'proxies' ? <ProxiesView {...proxiesProps} /> :
    view === 'logs' ? <LogsView {...logsProps} /> :
    view === 'settings' ? <SettingsView {...settingsProps} /> :
    <AccountView {...accountProps} />

  return (
    <>
      <DesktopWorkspaceChrome {...shellProps} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${view}-${shellProps.locale}`}
          initial="initial"
          animate="animate"
          exit="exit"
          variants={PAGE_VIEW_VARIANTS}
          transition={PAGE_TRANSITION}
        >
          {viewContent}
        </motion.div>
      </AnimatePresence>
    </>
  )
}
