import type { ProfileRecord, ProxyRecord } from '../../src/shared/types'

export type ValidationLevel = 'pass' | 'warn' | 'block'

export interface ValidationResult {
  level: ValidationLevel
  messages: string[]
}

function isBlank(value: string): boolean {
  return value.trim().length === 0
}

function isMobileUserAgent(userAgent: string): boolean {
  return /android|iphone|ipad|mobile/i.test(userAgent)
}

function hasManagedProxyConflict(profile: ProfileRecord, proxy: ProxyRecord | null): boolean {
  return profile.fingerprintConfig.proxySettings.proxyMode === 'manager' && Boolean(profile.proxyId) && !proxy
}

function hasCustomProxyConflict(profile: ProfileRecord): boolean {
  const { proxySettings } = profile.fingerprintConfig
  return (
    proxySettings.proxyMode === 'custom' &&
    (isBlank(proxySettings.host) || !Number.isFinite(proxySettings.port) || proxySettings.port <= 0)
  )
}

function hasMissingDerivedFields(profile: ProfileRecord): boolean {
  const { fingerprintConfig } = profile
  const needsTimezone = !fingerprintConfig.advanced.autoTimezoneFromIp && isBlank(fingerprintConfig.timezone)
  const needsLanguage = !fingerprintConfig.advanced.autoLanguageFromIp && isBlank(fingerprintConfig.language)
  const needsGeo =
    !fingerprintConfig.advanced.autoGeolocationFromIp &&
    fingerprintConfig.advanced.geolocationPermission === 'allow' &&
    isBlank(fingerprintConfig.advanced.geolocation)
  return needsTimezone || needsLanguage || needsGeo
}

export function validateProfileForLaunch(
  profile: ProfileRecord,
  proxy: ProxyRecord | null,
): ValidationResult {
  const messages: string[] = []
  let level: ValidationLevel = 'pass'
  const { fingerprintConfig } = profile
  const { advanced } = fingerprintConfig

  if (hasManagedProxyConflict(profile, proxy)) {
    level = 'block'
    messages.push('代理模式为代理管理，但绑定的代理不存在。')
  }

  if (hasCustomProxyConflict(profile)) {
    level = 'block'
    messages.push('自定义代理缺少主机或端口。')
  }

  if (isBlank(fingerprintConfig.userAgent)) {
    level = 'block'
    messages.push('User Agent 不能为空。')
  }

  if (!Number.isFinite(advanced.windowWidth) || !Number.isFinite(advanced.windowHeight) || advanced.windowWidth < 320 || advanced.windowHeight < 480) {
    level = 'block'
    messages.push('窗口尺寸非法，无法稳定启动。')
  }

  const mobileUa = isMobileUserAgent(fingerprintConfig.userAgent)
  if (advanced.deviceMode === 'desktop' && mobileUa) {
    level = level === 'block' ? level : 'warn'
    messages.push('当前 UA 与桌面设备模式不一致。')
  }

  if (advanced.deviceMode !== 'desktop' && !mobileUa) {
    level = level === 'block' ? level : 'warn'
    messages.push('当前 UA 与移动设备模式不一致。')
  }

  if (hasMissingDerivedFields(profile)) {
    level = level === 'block' ? level : 'warn'
    messages.push('自动联动已关闭，但时区、语言或地理位置仍缺失。')
  }

  if (messages.length === 0) {
    messages.push('环境校验通过，可启动。')
  }

  return { level, messages }
}
