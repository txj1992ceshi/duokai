import type {
  EnvironmentPurpose,
  FingerprintConfig,
  ProxyRecord,
  StartupNavigationResult,
  UpdateProfileInput,
} from '../../src/shared/types'
import { applyPlatformTemplate, createDefaultFingerprint } from './factories'

export type PlatformSmokeScenarioId =
  | 'default'
  | 'linkedin-register-smoke'
  | 'tiktok-nurture-smoke'

export interface PlatformSmokeSelectorDiagnostic {
  id: string
  selector: string
}

export interface PlatformSmokeScenario {
  id: PlatformSmokeScenarioId
  label: string
  platform: 'custom' | 'linkedin' | 'tiktok'
  environmentPurpose: EnvironmentPurpose
  startupUrl: string
  expectedHosts: string[]
  requiresProxy: boolean
  tags: string[]
  probeKeys: string[]
  selectorDiagnostics: PlatformSmokeSelectorDiagnostic[]
}

export interface PlatformSmokeProbeResult {
  finalUrl: string
  finalHost: string
  title: string
  readyState: string
  success: boolean
  selectorMatches: Record<string, number>
}

export interface PlatformSmokeEvaluationInput {
  scenario: PlatformSmokeScenario
  launchPassed: boolean
  startupNavigation: StartupNavigationResult | null | undefined
  probe: PlatformSmokeProbeResult | null | undefined
}

export interface PlatformSmokeEvaluationResult {
  success: boolean
  reasons: string[]
}

const PLATFORM_SMOKE_SCENARIOS: Record<PlatformSmokeScenarioId, PlatformSmokeScenario> = {
  default: {
    id: 'default',
    label: 'Default startup smoke',
    platform: 'custom',
    environmentPurpose: 'operation',
    startupUrl: 'https://example.com',
    expectedHosts: ['example.com'],
    requiresProxy: false,
    tags: ['ci', 'windows-smoke'],
    probeKeys: ['page', 'navigator', 'webgl'],
    selectorDiagnostics: [
      { id: 'body', selector: 'body' },
      { id: 'main', selector: 'main' },
    ],
  },
  'linkedin-register-smoke': {
    id: 'linkedin-register-smoke',
    label: 'LinkedIn register smoke',
    platform: 'linkedin',
    environmentPurpose: 'register',
    startupUrl: 'https://www.linkedin.com/',
    expectedHosts: ['www.linkedin.com', 'linkedin.com'],
    requiresProxy: false,
    tags: ['ci', 'platform-smoke', 'linkedin'],
    probeKeys: ['page', 'navigator', 'clientHints', 'fonts', 'mediaDevices', 'speechVoices', 'webgl'],
    selectorDiagnostics: [
      { id: 'main', selector: 'main' },
      { id: 'login-email', selector: 'input[name="session_key"]' },
      { id: 'join-link', selector: 'a[href*="signup"], a[href*="join"]' },
    ],
  },
  'tiktok-nurture-smoke': {
    id: 'tiktok-nurture-smoke',
    label: 'TikTok nurture smoke',
    platform: 'tiktok',
    environmentPurpose: 'nurture',
    startupUrl: 'https://www.tiktok.com/',
    expectedHosts: ['www.tiktok.com', 'tiktok.com'],
    requiresProxy: false,
    tags: ['ci', 'platform-smoke', 'tiktok'],
    probeKeys: ['page', 'navigator', 'clientHints', 'fonts', 'mediaDevices', 'speechVoices', 'webgl'],
    selectorDiagnostics: [
      { id: 'main', selector: 'main' },
      { id: 'search-input', selector: 'input[type="search"], input[name="q"]' },
      { id: 'data-e2e', selector: '[data-e2e]' },
    ],
  },
}

export function parseSmokeRequireProxy(value?: string | null): boolean | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {
    return null
  }
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return null
}

export function resolvePlatformSmokeScenario(
  requestedId?: string | null,
  requireProxyOverride?: boolean | null,
): PlatformSmokeScenario {
  const normalized = String(requestedId || '').trim().toLowerCase() as PlatformSmokeScenarioId
  const scenario = PLATFORM_SMOKE_SCENARIOS[normalized] ?? PLATFORM_SMOKE_SCENARIOS.default
  if (requireProxyOverride === null || requireProxyOverride === undefined) {
    return scenario
  }
  return {
    ...scenario,
    requiresProxy: requireProxyOverride,
  }
}

function applyProxySettings(fingerprint: FingerprintConfig, proxy: ProxyRecord | null): FingerprintConfig {
  if (!proxy) {
    return fingerprint
  }
  return {
    ...fingerprint,
    proxySettings: {
      ...fingerprint.proxySettings,
      proxyMode: 'custom',
      proxyType: proxy.type,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username,
      password: proxy.password,
    },
  }
}

export function buildPlatformSmokeFingerprint(
  scenario: PlatformSmokeScenario,
  proxy: ProxyRecord | null,
  options: {
    timezone?: string
    startupUrlOverride?: string
  } = {},
): FingerprintConfig {
  const startupUrl = options.startupUrlOverride?.trim() || scenario.startupUrl
  const applyFallbackTimezone = (fingerprint: FingerprintConfig): FingerprintConfig => {
    if (!options.timezone || proxy) {
      return fingerprint
    }
    return {
      ...fingerprint,
      timezone: options.timezone,
      advanced: {
        ...fingerprint.advanced,
        autoTimezoneFromIp: false,
      },
    }
  }
  if (scenario.platform === 'custom') {
    const fingerprint = applyFallbackTimezone(applyProxySettings(createDefaultFingerprint(), proxy))
    fingerprint.basicSettings.platform = 'custom'
    fingerprint.basicSettings.customPlatformUrl = startupUrl
    return fingerprint
  }

  const { fingerprint } = applyPlatformTemplate(createDefaultFingerprint(), scenario.platform)
  const withProxy = applyFallbackTimezone(applyProxySettings(fingerprint, proxy))
  return {
    ...withProxy,
    basicSettings: {
      ...withProxy.basicSettings,
      customPlatformUrl: startupUrl,
    },
  }
}

export function buildPlatformSmokeProfileInput(
  scenario: PlatformSmokeScenario,
  proxy: ProxyRecord | null,
  options: {
    profileId: string
    profileName: string
    startupUrlOverride?: string
    timezone?: string
  },
): UpdateProfileInput {
  return {
    id: options.profileId,
    name: options.profileName,
    proxyId: null,
    groupName: 'CI Smoke',
    tags: scenario.tags,
    notes: `Generated by desktop smoke harness for ${scenario.id}`,
    environmentPurpose: scenario.environmentPurpose,
    fingerprintConfig: buildPlatformSmokeFingerprint(scenario, proxy, {
      startupUrlOverride: options.startupUrlOverride,
      timezone: options.timezone,
    }),
  }
}

export function evaluatePlatformSmokeSuccess(
  input: PlatformSmokeEvaluationInput,
): PlatformSmokeEvaluationResult {
  const reasons: string[] = []

  if (!input.launchPassed) {
    reasons.push('runtime launch did not complete successfully')
  }

  if (!input.startupNavigation?.success) {
    reasons.push(
      `startup navigation failed${
        input.startupNavigation?.reasonCode ? ` (${input.startupNavigation.reasonCode})` : ''
      }`,
    )
  }

  const finalHost = String(input.probe?.finalHost || '').trim().toLowerCase()
  if (!finalHost || !input.scenario.expectedHosts.some((host) => host === finalHost)) {
    reasons.push(`final host mismatch: expected ${input.scenario.expectedHosts.join(', ')}, got ${finalHost || 'unknown'}`)
  }

  if (!input.probe?.success) {
    reasons.push('page probe did not complete successfully')
  }

  return {
    success: reasons.length === 0,
    reasons,
  }
}

export function buildPlatformSmokeArtifactBaseName(
  scenario: PlatformSmokeScenario,
  label?: string | null,
): string {
  const suffix = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return suffix ? `${scenario.id}-${suffix}` : scenario.id
}
