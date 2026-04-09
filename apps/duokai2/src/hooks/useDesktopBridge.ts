import { useCallback, useMemo } from 'react'
import i18nClient from '../lib/i18n-client'
import type { DesktopApi } from '../shared/ipc'

function getNestedValue(target: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null || !(key in current)) {
      return undefined
    }

    return (current as Record<string, unknown>)[key]
  }, target)
}

export function useDesktopBridge(locale: string) {
  const desktopT = useMemo(() => i18nClient.getFixedT(locale, 'desktop'), [locale])

  const bridgeUnavailableMessage = useCallback((path?: string) => {
    return path
      ? desktopT('bridge.unavailableWithPath', { path })
      : desktopT('bridge.unavailable')
  }, [desktopT])

  const localizeError = useCallback((error: unknown) => {
    if (!(error instanceof Error)) {
      return desktopT('bridge.unknownError')
    }

    if (
      error.message.startsWith('BRIDGE_UNAVAILABLE:') ||
      error.message.startsWith('MISSING_API:') ||
      error.message.includes("Cannot read properties of undefined")
    ) {
      const path = error.message.split(':').slice(1).join(':').trim() || undefined
      return bridgeUnavailableMessage(path)
    }

    if (error.message.startsWith('VALIDATION:')) {
      return error.message.replace('VALIDATION:', '').trim()
    }

    return error.message
  }, [bridgeUnavailableMessage, desktopT])

  const requireDesktopApi = useCallback((requiredPaths: string[] = []) => {
    const api = window.desktop as DesktopApi | undefined
    if (!api) {
      throw new Error('BRIDGE_UNAVAILABLE:')
    }

    for (const path of requiredPaths) {
      if (typeof getNestedValue(api, path) === 'undefined') {
        throw new Error(`MISSING_API:${path}`)
      }
    }

    return api
  }, [])

  return {
    localizeError,
    requireDesktopApi,
  }
}
