import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

import type { FingerprintConfig } from '../../src/shared/types'
import {
  buildCloakClientHintsPolicy,
  type CloakClientHintsPolicy,
} from './cloakBrowserClientHints.ts'
import { resolveDeviceInfoBaseline } from './desktopRealism.ts'
import type { CloakRuntimeLaunchRequest } from './cloakBrowserRuntime.ts'

export const CLOAK_FINGERPRINT_MAPPING_VERSION = 2

export type CloakFingerprintMappingErrorCode =
  | 'invalid_profile'
  | 'unsupported_device'
  | 'unsupported_kernel'
  | 'browser_version_mismatch'
  | 'unstable_fingerprint'
  | 'partial_noise_policy_unsupported'
  | 'missing_resolved_environment'
  | 'missing_verified_webrtc_ip'
  | 'invalid_network_identity'

export class CloakFingerprintMappingError extends Error {
  readonly code: CloakFingerprintMappingErrorCode

  constructor(code: CloakFingerprintMappingErrorCode, message: string) {
    super(message)
    this.name = 'CloakFingerprintMappingError'
    this.code = code
  }
}

export type CloakFingerprintPlatform = 'windows' | 'macos' | 'linux'

export interface CloakResolvedGeolocation {
  latitude: number
  longitude: number
  accuracy?: number
}

export interface CloakFingerprintMappingInput {
  profileId: string
  fingerprintConfig: FingerprintConfig
  browserVersion: string
  resolvedLocale?: string
  resolvedTimezone?: string
  resolvedGeolocation?: CloakResolvedGeolocation | null
  verifiedWebRtcIp?: string
}

export interface CloakFingerprintMapping {
  schemaVersion: number
  profileId: string
  fingerprintSeed: number
  seedSource: 'hardwareSeed' | 'hardwareProfileId' | 'profileId'
  platform: CloakFingerprintPlatform
  locale: string
  timezone: string
  chromiumVersion: string
  chromiumMajor: string
  clientHintsPolicy: CloakClientHintsPolicy
  mappedFingerprintArgs: string[]
  permissions: string[]
  geolocation: CloakResolvedGeolocation | null
  legacyInitScriptPolicy: 'forbidden'
  nativeOwnedSignals: string[]
  compatibilityWarnings: string[]
  mappingHash: string
}

const NATIVE_OWNED_SIGNALS = [
  'userAgent',
  'userAgentData',
  'navigator.platform',
  'navigator.language',
  'navigator.languages',
  'navigator.hardwareConcurrency',
  'navigator.deviceMemory',
  'screen',
  'canvas',
  'webgl-image',
  'webgl-metadata',
  'audio',
  'fonts',
  'client-rects',
  'timezone',
  'geolocation',
  'webrtc-ip',
] as const

function trim(value: unknown): string {
  return String(value ?? '').trim()
}

function stableHash(value: string): number {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash || 1
}

function stableSeed(value: string): number {
  const seed = stableHash(`duokai-cloak-fingerprint-v1:${value}`) & 0x7fffffff
  return seed || 1
}

function canonicalChromiumVersion(version: string): string {
  const normalized = trim(version)
  if (!/^\d+(?:\.\d+){3,4}$/.test(normalized)) {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `A fully pinned Cloak Chromium version is required; received "${normalized}".`,
    )
  }
  return normalized.split('.').slice(0, 4).join('.')
}

function browserMajor(value: string): string {
  const match = trim(value).match(/^(\d+)/)
  return match?.[1] || ''
}

function userAgentChromeMajor(userAgent: string): string {
  return userAgent.match(/Chrome\/(\d+)/i)?.[1] || ''
}

function resolvePlatform(config: FingerprintConfig): CloakFingerprintPlatform {
  if (config.advanced.deviceMode !== 'desktop') {
    throw new CloakFingerprintMappingError(
      'unsupported_device',
      `CloakBrowser Phase 2 only supports desktop profiles; received ${config.advanced.deviceMode}.`,
    )
  }
  if (config.advanced.browserKernel !== 'chrome') {
    throw new CloakFingerprintMappingError(
      'unsupported_kernel',
      `CloakBrowser requires the Chrome kernel; received ${config.advanced.browserKernel}.`,
    )
  }
  const operatingSystem = trim(config.advanced.operatingSystem).toLowerCase()
  if (operatingSystem.includes('windows')) {
    return 'windows'
  }
  if (operatingSystem.includes('mac')) {
    return 'macos'
  }
  if (operatingSystem.includes('linux')) {
    return 'linux'
  }
  throw new CloakFingerprintMappingError(
    'invalid_profile',
    `Unsupported desktop operating system: "${config.advanced.operatingSystem}".`,
  )
}

function inferUserAgentPlatform(userAgent: string): CloakFingerprintPlatform | null {
  if (/Windows NT/i.test(userAgent)) {
    return 'windows'
  }
  if (/Macintosh|Mac OS X/i.test(userAgent)) {
    return 'macos'
  }
  if (/(?:X11;\s*)?Linux x86_64/i.test(userAgent) && !/Android/i.test(userAgent)) {
    return 'linux'
  }
  return null
}

function validateBrowserIdentity(
  config: FingerprintConfig,
  chromiumMajor: string,
  platform: CloakFingerprintPlatform,
): void {
  const configuredMajors = [
    ['advanced.browserVersion', browserMajor(config.advanced.browserVersion)],
    ['advanced.browserKernelVersion', browserMajor(config.advanced.browserKernelVersion)],
    ['userAgent', userAgentChromeMajor(config.userAgent)],
  ] as const

  const mismatches = configuredMajors.filter(([, major]) => major && major !== chromiumMajor)
  if (mismatches.length > 0) {
    throw new CloakFingerprintMappingError(
      'browser_version_mismatch',
      `Profile browser identity must match Cloak Chromium major ${chromiumMajor}; mismatched fields: ${mismatches
        .map(([name, major]) => `${name}=${major}`)
        .join(', ')}.`,
    )
  }

  const userAgentPlatform = inferUserAgentPlatform(config.userAgent)
  if (!userAgentPlatform || userAgentPlatform !== platform) {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `Profile User-Agent platform must match ${platform}; received ${userAgentPlatform || 'unknown'}.`,
    )
  }
}

function normalizeLocale(value: string): string {
  try {
    const canonical = Intl.getCanonicalLocales(value)[0]
    if (canonical) {
      return canonical
    }
  } catch {
    // handled below
  }
  throw new CloakFingerprintMappingError(
    'invalid_profile',
    `Invalid BCP 47 locale: "${value}".`,
  )
}

function normalizeTimezone(value: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone
  } catch {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `Invalid IANA timezone: "${value}".`,
    )
  }
}

function normalizeFlagValue(name: string, value: string, maxLength = 256): string {
  const normalized = trim(value)
  if (
    !normalized ||
    normalized.length > maxLength ||
    normalized.includes('\0') ||
    normalized.includes('\r') ||
    normalized.includes('\n')
  ) {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `Invalid ${name} value for Cloak launch arguments.`,
    )
  }
  return normalized
}

function normalizeCpuCores(value: unknown): number {
  const normalized = Math.round(Number(value))
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 64) {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `Invalid hardware concurrency value: "${String(value)}".`,
    )
  }
  return normalized
}

function normalizeDeviceMemory(value: unknown): {
  value: 1 | 2 | 4 | 8
  warning: string
} {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0 || numeric > 512) {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `Invalid device memory value: "${String(value)}".`,
    )
  }
  const normalized: 1 | 2 | 4 | 8 = numeric <= 1 ? 1 : numeric <= 2 ? 2 : numeric <= 4 ? 4 : 8
  return {
    value: normalized,
    warning:
      numeric === normalized
        ? ''
        : `Configured memoryGb=${numeric} was normalized to navigator.deviceMemory=${normalized} GB to match Chromium's exposed device-memory buckets.`,
  }
}

function assertStableModes(config: FingerprintConfig): boolean {
  if (config.commonSettings.randomizeFingerprintOnLaunch) {
    throw new CloakFingerprintMappingError(
      'unstable_fingerprint',
      'randomizeFingerprintOnLaunch is incompatible with stable Cloak identity.',
    )
  }

  const unstableModes = [
    ['fontMode', config.advanced.fontMode],
    ['canvasMode', config.advanced.canvasMode],
    ['webglImageMode', config.advanced.webglImageMode],
    ['webglMetadataMode', config.advanced.webglMetadataMode],
    ['audioContextMode', config.advanced.audioContextMode],
    ['mediaDevicesMode', config.advanced.mediaDevicesMode],
    ['speechVoicesMode', config.advanced.speechVoicesMode],
    ['clientRectsMode', config.advanced.clientRectsMode],
  ].filter(([, mode]) => mode === 'random')

  if (unstableModes.length > 0) {
    throw new CloakFingerprintMappingError(
      'unstable_fingerprint',
      `Per-launch random fingerprint modes are forbidden: ${unstableModes
        .map(([name]) => name)
        .join(', ')}.`,
    )
  }

  const noiseModes = [
    config.advanced.canvasMode,
    config.advanced.webglImageMode,
    config.advanced.audioContextMode,
    config.advanced.clientRectsMode,
  ]
  const disabledNoiseCount = noiseModes.filter((mode) => mode === 'off').length
  if (disabledNoiseCount > 0 && disabledNoiseCount < noiseModes.length) {
    throw new CloakFingerprintMappingError(
      'partial_noise_policy_unsupported',
      'Cloak Chromium 145 can disable native Canvas/WebGL/Audio/ClientRects noise only as one global policy; partial legacy off/custom combinations cannot be mapped safely.',
    )
  }
  return disabledNoiseCount === noiseModes.length
}

function resolveLocale(input: CloakFingerprintMappingInput): string {
  const config = input.fingerprintConfig
  const resolved = trim(input.resolvedLocale)
  if (resolved) {
    return normalizeLocale(resolved)
  }
  if (config.advanced.autoLanguageFromIp || config.advanced.autoInterfaceLanguageFromIp) {
    throw new CloakFingerprintMappingError(
      'missing_resolved_environment',
      'A resolved locale is required when automatic language resolution is enabled.',
    )
  }
  const fallback = trim(config.advanced.interfaceLanguage) || trim(config.language)
  if (!fallback) {
    throw new CloakFingerprintMappingError(
      'missing_resolved_environment',
      'A non-empty locale is required for Cloak fingerprint mapping.',
    )
  }
  return normalizeLocale(fallback)
}

function resolveTimezone(input: CloakFingerprintMappingInput): string {
  const config = input.fingerprintConfig
  const resolved = trim(input.resolvedTimezone)
  if (resolved) {
    return normalizeTimezone(resolved)
  }
  if (config.advanced.autoTimezoneFromIp) {
    throw new CloakFingerprintMappingError(
      'missing_resolved_environment',
      'A resolved timezone is required when automatic timezone resolution is enabled.',
    )
  }
  const fallback = trim(config.timezone)
  if (!fallback) {
    throw new CloakFingerprintMappingError(
      'missing_resolved_environment',
      'A non-empty timezone is required for Cloak fingerprint mapping.',
    )
  }
  return normalizeTimezone(fallback)
}

function normalizeGeolocation(
  value: CloakResolvedGeolocation,
  source: string,
): CloakResolvedGeolocation {
  const latitude = Number(value.latitude)
  const longitude = Number(value.longitude)
  const accuracy = value.accuracy === undefined ? undefined : Number(value.accuracy)
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    (accuracy !== undefined && (!Number.isFinite(accuracy) || accuracy < 0))
  ) {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `Invalid geolocation coordinates from ${source}.`,
    )
  }
  return {
    latitude,
    longitude,
    ...(accuracy === undefined ? {} : { accuracy }),
  }
}

function parseConfiguredGeolocation(value: string): CloakResolvedGeolocation | null {
  const parts = value
    .split(',')
    .map((item) => Number(item.trim()))
  if (parts.length !== 2 || parts.some((item) => !Number.isFinite(item))) {
    return null
  }
  return normalizeGeolocation(
    { latitude: parts[0], longitude: parts[1] },
    'fingerprintConfig.advanced.geolocation',
  )
}

function resolveGeolocation(
  input: CloakFingerprintMappingInput,
): CloakResolvedGeolocation | null {
  const config = input.fingerprintConfig
  if (input.resolvedGeolocation) {
    return normalizeGeolocation(input.resolvedGeolocation, 'resolved environment')
  }
  if (config.advanced.autoGeolocationFromIp) {
    throw new CloakFingerprintMappingError(
      'missing_resolved_environment',
      'Resolved geolocation coordinates are required when automatic geolocation is enabled.',
    )
  }
  const raw = trim(config.advanced.geolocation)
  if (!raw) {
    return null
  }
  const parsed = parseConfiguredGeolocation(raw)
  if (!parsed) {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `Invalid geolocation coordinates: "${raw}".`,
    )
  }
  return parsed
}

function parseResolution(config: FingerprintConfig): { width: number; height: number } {
  const matched = trim(config.resolution).match(/^(\d{3,5})\s*[xX×]\s*(\d{3,5})$/)
  const width = matched ? Number(matched[1]) : Number(config.advanced.windowWidth)
  const height = matched ? Number(matched[2]) : Number(config.advanced.windowHeight)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || height < 240) {
    throw new CloakFingerprintMappingError(
      'invalid_profile',
      `Invalid screen resolution: "${config.resolution || `${width}x${height}`}".`,
    )
  }
  return { width, height }
}

function gpuLooksCoherent(
  platform: CloakFingerprintPlatform,
  vendor: string,
  renderer: string,
): boolean {
  const combined = `${vendor} ${renderer}`.toLowerCase()
  if (!vendor || !renderer) {
    return false
  }
  if (platform === 'macos') {
    return !/(direct3d|d3d11|d3d12|rtx\s*\d|geforce)/i.test(combined)
  }
  if (platform === 'windows') {
    return /(angle|direct3d|d3d11|d3d12)/i.test(combined)
  }
  return !/(direct3d|d3d11|d3d12)/i.test(combined)
}

function resolveSeedIdentity(
  profileId: string,
  config: FingerprintConfig,
): { source: CloakFingerprintMapping['seedSource']; material: string } {
  const hardwareSeed = trim(config.runtimeMetadata.hardwareSeed)
  if (hardwareSeed) {
    return { source: 'hardwareSeed', material: hardwareSeed }
  }
  const hardwareProfileId = trim(config.runtimeMetadata.hardwareProfileId)
  if (hardwareProfileId) {
    return { source: 'hardwareProfileId', material: hardwareProfileId }
  }
  return { source: 'profileId', material: profileId }
}

function buildWebRtcArgs(
  config: FingerprintConfig,
  verifiedWebRtcIp: string,
): string[] {
  if (config.webrtcMode === 'disabled') {
    return ['--disable-webrtc']
  }
  if (config.webrtcMode !== 'proxy-aware') {
    return []
  }

  const args = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']
  const ip = trim(verifiedWebRtcIp)
  const proxyExpected = config.proxySettings.proxyMode !== 'direct'
  if (!ip) {
    if (proxyExpected) {
      throw new CloakFingerprintMappingError(
        'missing_verified_webrtc_ip',
        'Proxy-aware Cloak mapping requires the verified proxy egress IP; automatic resolution is forbidden.',
      )
    }
    return args
  }
  if (isIP(ip) === 0) {
    throw new CloakFingerprintMappingError(
      'invalid_network_identity',
      `Invalid verified WebRTC IP: "${ip}".`,
    )
  }
  args.push(`--fingerprint-webrtc-ip=${ip}`)
  return args
}

function computeMappingHash(mapping: Omit<CloakFingerprintMapping, 'mappingHash'>): string {
  return createHash('sha256').update(JSON.stringify(mapping)).digest('hex')
}

export function buildCloakFingerprintMapping(
  input: CloakFingerprintMappingInput,
): CloakFingerprintMapping {
  const profileId = trim(input.profileId)
  if (!profileId) {
    throw new CloakFingerprintMappingError('invalid_profile', 'profileId is required.')
  }

  const config = input.fingerprintConfig
  const chromiumVersion = canonicalChromiumVersion(input.browserVersion)
  const chromiumMajor = chromiumVersion.split('.')[0]
  const platform = resolvePlatform(config)
  validateBrowserIdentity(config, chromiumMajor, platform)
  const disableNativeNoise = assertStableModes(config)
  const locale = resolveLocale(input)
  const timezone = resolveTimezone(input)
  const geolocation = resolveGeolocation(input)
  const screen = parseResolution(config)
  const seedIdentity = resolveSeedIdentity(profileId, config)
  const fingerprintSeed = stableSeed(seedIdentity.material)
  const compatibilityWarnings: string[] = []
  const deviceInfoBaseline = resolveDeviceInfoBaseline(config)
  const clientHintsPolicy = buildCloakClientHintsPolicy({
    platform,
    locale,
    userAgent: config.userAgent,
    chromiumVersion,
    platformVersion:
      trim(config.advanced.operatingSystemVersion) || deviceInfoBaseline.platformVersion,
    architecture: deviceInfoBaseline.architecture === 'arm' ? 'arm' : 'x86',
    bitness: deviceInfoBaseline.bitness || '64',
    wow64: deviceInfoBaseline.wow64,
  })
  compatibilityWarnings.push(
    'Cloak Chromium 145 has no explicit architecture mapping flag; UA Client Hints architecture and bitness are enforced with a CDP native override before startup navigation.',
  )
  const cpuCores = normalizeCpuCores(config.advanced.cpuCores)
  const deviceMemory = normalizeDeviceMemory(config.advanced.memoryGb)
  if (deviceMemory.warning) {
    compatibilityWarnings.push(deviceMemory.warning)
  }

  const mappedFingerprintArgs = [
    `--fingerprint-platform=${platform}`,
    `--fingerprint-hardware-concurrency=${cpuCores}`,
    `--fingerprint-device-memory=${deviceMemory.value}`,
    `--fingerprint-screen-width=${screen.width}`,
    `--fingerprint-screen-height=${screen.height}`,
    `--fingerprint-taskbar-height=${platform === 'macos' ? 95 : platform === 'windows' ? 48 : 0}`,
    '--fingerprint-brand=Chrome',
    `--fingerprint-brand-version=${chromiumVersion}`,
  ]

  const platformVersion = trim(config.advanced.operatingSystemVersion)
  if (platformVersion) {
    mappedFingerprintArgs.push(
      `--fingerprint-platform-version=${normalizeFlagValue('operatingSystemVersion', platformVersion)}`,
    )
  }

  const gpuVendor = trim(config.advanced.webglVendor)
  const gpuRenderer = trim(config.advanced.webglRenderer)
  if (gpuVendor || gpuRenderer) {
    compatibilityWarnings.push(
      gpuLooksCoherent(platform, gpuVendor, gpuRenderer)
        ? 'Legacy WebGL vendor/renderer values are intentionally not mapped; Cloak seed-derived GPU identity is required to preserve profile uniqueness.'
        : 'Legacy WebGL vendor/renderer values were not mapped because they are incomplete or incoherent with the selected platform; Cloak seed-derived GPU identity will be used.',
    )
  }

  if (geolocation) {
    mappedFingerprintArgs.push(
      `--fingerprint-location=${geolocation.latitude},${geolocation.longitude}`,
    )
  }
  if (disableNativeNoise) {
    mappedFingerprintArgs.push('--fingerprint-noise=false')
  }
  if (config.advanced.doNotTrackEnabled) {
    mappedFingerprintArgs.push('--enable-do-not-track')
  }
  mappedFingerprintArgs.push(...buildWebRtcArgs(config, input.verifiedWebRtcIp || ''))

  if (config.advanced.mediaDevicesMode !== 'off') {
    compatibilityWarnings.push(
      'Cloak Chromium 145 has no explicit media-device mapping flag; the native browser/device output is retained and the legacy JS enumerateDevices override must remain disabled.',
    )
  }
  if (config.advanced.speechVoicesMode !== 'off') {
    compatibilityWarnings.push(
      'Cloak Chromium 145 has no explicit speech-voice mapping flag; the native voice table is retained and the legacy JS speechSynthesis override must remain disabled.',
    )
  }
  if (config.advanced.webglMetadataMode === 'off') {
    compatibilityWarnings.push(
      'Legacy webglMetadataMode=off cannot suppress native WebGL metadata independently; Cloak native coherent metadata remains active.',
    )
  }
  if (config.advanced.deviceInfoMode === 'off') {
    compatibilityWarnings.push(
      'Legacy deviceInfoMode=off does not disable Cloak native UA and Client Hints identity.',
    )
  }
  if (trim(config.advanced.deviceName) || trim(config.advanced.hostIp) || trim(config.advanced.macAddress)) {
    compatibilityWarnings.push(
      'Legacy deviceName, hostIp and macAddress are not browser-exposed Cloak mapping inputs and are intentionally ignored.',
    )
  }

  const permissions =
    geolocation && config.advanced.geolocationPermission === 'allow'
      ? ['geolocation']
      : []

  const withoutHash: Omit<CloakFingerprintMapping, 'mappingHash'> = {
    schemaVersion: CLOAK_FINGERPRINT_MAPPING_VERSION,
    profileId,
    fingerprintSeed,
    seedSource: seedIdentity.source,
    platform,
    locale,
    timezone,
    chromiumVersion,
    chromiumMajor,
    clientHintsPolicy,
    mappedFingerprintArgs: Array.from(new Set(mappedFingerprintArgs)),
    permissions,
    geolocation,
    legacyInitScriptPolicy: 'forbidden',
    nativeOwnedSignals: [...NATIVE_OWNED_SIGNALS],
    compatibilityWarnings,
  }

  return {
    ...withoutHash,
    mappingHash: computeMappingHash(withoutHash),
  }
}

export function applyCloakFingerprintMappingToLaunchRequest(
  request: CloakRuntimeLaunchRequest,
  mapping: CloakFingerprintMapping,
): CloakRuntimeLaunchRequest {
  return {
    ...request,
    locale: mapping.locale,
    timezoneId: mapping.timezone,
    fingerprintSeed: mapping.fingerprintSeed,
    clientHintsPolicy: mapping.clientHintsPolicy,
    mappedFingerprintArgs: mapping.mappedFingerprintArgs,
    permissions: mapping.permissions,
    geolocation: mapping.geolocation ?? undefined,
  }
}
