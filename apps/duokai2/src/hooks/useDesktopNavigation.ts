import type { Dispatch, SetStateAction } from 'react'
import type { LocaleCode } from '../i18n'
import i18nClient from '../lib/i18n-client'
import type { DesktopUpdateState } from '../shared/types'
import type {
  MainNavItem,
  MainNavKey,
  SecondaryNavItem,
} from '../layouts/MainLayout'

type DesktopViewKey =
  | 'dashboard'
  | 'profiles'
  | 'cloudPhones'
  | 'proxies'
  | 'logs'
  | 'settings'
  | 'account'

type EnvironmentCenterView = Extract<DesktopViewKey, 'dashboard' | 'profiles' | 'cloudPhones'>

type ProfilePageMode = 'list' | 'create' | 'edit'
type ResourceMode = 'profiles' | 'templates'

export function useDesktopNavigation({
  locale,
  mainSection,
  setMainSection,
  view,
  setView,
  updateState,
  setResourceMode,
  setProfilePageMode,
}: {
  locale: LocaleCode
  mainSection: MainNavKey
  setMainSection: Dispatch<SetStateAction<MainNavKey>>
  view: DesktopViewKey
  setView: Dispatch<SetStateAction<DesktopViewKey>>
  updateState: DesktopUpdateState | null
  setResourceMode: Dispatch<SetStateAction<ResourceMode>>
  setProfilePageMode: Dispatch<SetStateAction<ProfilePageMode>>
}) {
  const desktopT = i18nClient.getFixedT(locale, 'desktop')

  const environmentCenterTabs: Array<{ key: EnvironmentCenterView; label: string }> = [
    { key: 'dashboard', label: desktopT('navigation.tabs.dashboard') },
    { key: 'profiles', label: desktopT('navigation.tabs.profiles') },
    { key: 'cloudPhones', label: desktopT('navigation.tabs.cloudPhones') },
  ]

  const pageHeading =
    view === 'profiles' && mainSection === 'groupManagement'
      ? {
          title: desktopT('headings.groupManagement.title'),
          subtitle: desktopT('headings.groupManagement.subtitle'),
        }
      : view === 'profiles'
        ? {
            title: desktopT('headings.environmentCenter.title'),
            subtitle: desktopT('headings.environmentCenter.subtitle'),
          }
        : view === 'cloudPhones'
          ? {
              title: desktopT('headings.cloudPhones.title'),
              subtitle: desktopT('headings.cloudPhones.subtitle'),
            }
          : view === 'proxies'
            ? {
                title: desktopT('headings.proxies.title'),
                subtitle: desktopT('headings.proxies.subtitle'),
              }
            : view === 'logs'
              ? {
                  title: desktopT('headings.logs.title'),
                  subtitle: desktopT('headings.logs.subtitle'),
                }
              : view === 'settings'
                ? {
                    title: desktopT('headings.settings.title'),
                    subtitle: desktopT('headings.settings.subtitle'),
                  }
                : view === 'account'
                  ? {
                      title: desktopT('headings.account.title'),
                      subtitle: desktopT('headings.account.subtitle'),
                    }
                  : {
                      title: desktopT('headings.dashboard.title'),
                      subtitle: desktopT('headings.dashboard.subtitle'),
                    }

  const breadcrumbItems = [
    {
      label:
        mainSection === 'environmentCenter'
          ? desktopT('navigation.main.environmentCenter')
          : mainSection === 'proxyRepository'
            ? desktopT('navigation.main.proxyRepository')
            : mainSection === 'groupManagement'
              ? desktopT('navigation.main.groupManagement')
              : desktopT('navigation.main.settings'),
    },
    { label: pageHeading.title, current: true },
  ]

  const mainNav: MainNavItem[] = [
    {
      key: 'environmentCenter',
      label: desktopT('navigation.main.environmentCenter'),
      active: mainSection === 'environmentCenter' && ['dashboard', 'profiles', 'cloudPhones'].includes(view),
      onClick: () => {
        setMainSection('environmentCenter')
        setView('dashboard')
      },
    },
    {
      key: 'proxyRepository',
      label: desktopT('navigation.main.proxyRepository'),
      active: mainSection === 'proxyRepository' || view === 'proxies',
      onClick: () => {
        setMainSection('proxyRepository')
        setView('proxies')
      },
    },
    {
      key: 'groupManagement',
      label: desktopT('navigation.main.groupManagement'),
      active: mainSection === 'groupManagement',
      onClick: () => {
        setMainSection('groupManagement')
        setResourceMode('profiles')
        setProfilePageMode('list')
        setView('profiles')
      },
    },
    {
      key: 'settings',
      label: desktopT('navigation.main.settings'),
      active: mainSection === 'settings' || view === 'settings',
      attentionDot: Boolean(updateState?.attentionRequired),
      onClick: () => {
        setMainSection('settings')
        setView('settings')
      },
    },
  ]

  const secondaryNav: SecondaryNavItem[] = [
    {
      key: 'logs',
      label: desktopT('navigation.secondary.logs'),
      active: view === 'logs',
      onClick: () => setView('logs'),
    },
    {
      key: 'account',
      label: desktopT('navigation.secondary.account'),
      active: view === 'account',
      onClick: () => setView('account'),
    },
  ]

  return {
    environmentCenterTabs,
    pageHeading,
    breadcrumbItems,
    mainNav,
    secondaryNav,
    shellCopy: {
      title: desktopT('shell.title'),
      subtitle: desktopT('shell.subtitle'),
      logout: desktopT('shell.logout'),
    },
  }
}
