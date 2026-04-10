import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'
import { toast } from '@duokai/ui'
import i18nClient from '../lib/i18n-client'
import type { LocaleCode } from '../i18n'
import type { DesktopUpdateState, ProfileRecord } from '../shared/types'

type ViewKey =
  | 'dashboard'
  | 'profiles'
  | 'cloudPhones'
  | 'proxies'
  | 'logs'
  | 'settings'
  | 'account'

type PendingLaunchState = Record<string, number>

export function useDesktopFeedback({
  locale,
  errorMessage,
  noticeMessage,
  busyMessage,
  setNoticeMessage,
  updateState,
  lastUpdateNoticeKeyRef,
  profiles,
  runtimeQueuedIds,
  runtimeRunningIds,
  runtimeStartingIds,
  setPendingProfileLaunches,
  view,
  setTemplateDrawerOpen,
  resetProxyWorkspace,
}: {
  locale: LocaleCode
  errorMessage: string
  noticeMessage: string
  busyMessage: string
  setNoticeMessage: (value: string | ((current: string) => string)) => void
  updateState: DesktopUpdateState | null
  lastUpdateNoticeKeyRef: MutableRefObject<string>
  profiles: ProfileRecord[]
  runtimeQueuedIds: Set<string>
  runtimeRunningIds: Set<string>
  runtimeStartingIds: Set<string>
  setPendingProfileLaunches: (
    value:
      | PendingLaunchState
      | ((current: PendingLaunchState) => PendingLaunchState),
  ) => void
  view: ViewKey
  setTemplateDrawerOpen: (value: boolean) => void
  resetProxyWorkspace: () => void
}) {
  const desktopT = i18nClient.getFixedT(locale, 'desktop')
  const lastErrorToastRef = useRef('')

  useEffect(() => {
    void i18nClient.changeLanguage(locale)
  }, [locale])

  useEffect(() => {
    if (!noticeMessage) {
      return
    }
    toast.success(noticeMessage)
    setNoticeMessage('')
  }, [noticeMessage, setNoticeMessage])

  useEffect(() => {
    if (!errorMessage) {
      lastErrorToastRef.current = ''
      return
    }
    if (lastErrorToastRef.current === errorMessage) {
      return
    }
    lastErrorToastRef.current = errorMessage
    toast.error(errorMessage)
  }, [errorMessage])

  useEffect(() => {
    if (!busyMessage) {
      toast.dismiss('desktop-busy')
      return
    }
    toast.loading(busyMessage, {
      id: 'desktop-busy',
      duration: Infinity,
    })
    return () => {
      toast.dismiss('desktop-busy')
    }
  }, [busyMessage])

  useEffect(() => {
    if (!noticeMessage) {
      return
    }
    const timer = window.setTimeout(() => {
      setNoticeMessage('')
    }, 3000)
    return () => window.clearTimeout(timer)
  }, [noticeMessage, setNoticeMessage])

  useEffect(() => {
    if (!updateState) {
      return
    }
    const noticeKey = `${updateState.status}:${updateState.attentionVersion || updateState.latestVersion || ''}:${updateState.isPrereleaseCandidate ? 'pre' : 'stable'}`
    if (lastUpdateNoticeKeyRef.current === noticeKey) {
      return
    }
    if (updateState.status === 'available' && updateState.latestVersion) {
      lastUpdateNoticeKeyRef.current = noticeKey
      toast.success(
        desktopT(
          updateState.isPrereleaseCandidate ? 'feedback.prereleaseUpdateAvailable' : 'feedback.updateAvailable',
          { version: updateState.latestVersion },
        ),
        {
          id: `desktop-update-available:${updateState.attentionVersion || updateState.latestVersion}`,
          duration: 7000,
        },
      )
    }
    if (updateState.status === 'downloaded') {
      lastUpdateNoticeKeyRef.current = noticeKey
      toast.success(desktopT('feedback.updateDownloaded'), {
        id: `desktop-update-downloaded:${updateState.attentionVersion || updateState.latestVersion || 'current'}`,
        duration: 5000,
      })
    }
  }, [desktopT, lastUpdateNoticeKeyRef, updateState])

  useEffect(() => {
    setPendingProfileLaunches((current) => {
      const next = { ...current }
      let changed = false
      for (const profileId of Object.keys(current)) {
        const profile = profiles.find((item) => item.id === profileId)
        if (!profile) {
          delete next[profileId]
          changed = true
          continue
        }
        const runtimeStillPending =
          runtimeQueuedIds.has(profileId) || runtimeStartingIds.has(profileId)
        if (
          runtimeRunningIds.has(profileId) ||
          profile.status === 'running' ||
          profile.status === 'error' ||
          (!runtimeStillPending &&
            profile.status !== 'starting' &&
            profile.status !== 'queued')
        ) {
          delete next[profileId]
          changed = true
        }
      }
      return changed ? next : current
    })
  }, [
    profiles,
    runtimeQueuedIds,
    runtimeRunningIds,
    runtimeStartingIds,
    setPendingProfileLaunches,
  ])

  useEffect(() => {
    setNoticeMessage('')
    if (view !== 'profiles') {
      setTemplateDrawerOpen(false)
    }
    if (view !== 'proxies') {
      resetProxyWorkspace()
    }
  }, [resetProxyWorkspace, setNoticeMessage, setTemplateDrawerOpen, view])
}
