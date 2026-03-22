import type { ProfileRecord } from '../../src/shared/types'
import type { ProxyCheckResult } from './proxyCheck'

export function applyNetworkDerivedFingerprint(
  profile: ProfileRecord,
  check: ProxyCheckResult,
): ProfileRecord {
  if (!check.ok) {
    return profile
  }

  const { fingerprintConfig } = profile
  const nextLanguage =
    fingerprintConfig.advanced.autoLanguageFromIp && check.languageHint
      ? check.languageHint
      : fingerprintConfig.language
  const nextTimezone =
    fingerprintConfig.advanced.autoTimezoneFromIp && check.timezone
      ? check.timezone
      : fingerprintConfig.timezone
  const nextGeolocation =
    fingerprintConfig.advanced.autoGeolocationFromIp && check.geolocation
      ? check.geolocation
      : fingerprintConfig.advanced.geolocation

  return {
    ...profile,
    fingerprintConfig: {
      ...fingerprintConfig,
      language: nextLanguage,
      timezone: nextTimezone,
      advanced: {
        ...fingerprintConfig.advanced,
        geolocation: nextGeolocation,
      },
    },
  }
}
