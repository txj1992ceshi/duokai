import type { FingerprintConfig } from './types'

export const STABLE_HARDWARE_PROFILE_VERSION = 'desktop-hw-v1'

type HardwareProfileSource = NonNullable<FingerprintConfig['runtimeMetadata']['hardwareProfileSource']>

type HardwareArchetype = {
  id: string
  operatingSystem: 'Windows' | 'macOS'
  browserVersions: string[]
  resolutions: Array<{ width: number; height: number }>
  cpuOptions: number[]
  memoryOptions: number[]
  webgl: Array<{ vendor: string; renderer: string }>
  deviceNamePrefix: string[]
  hostIpRanges: Array<{ first: number; second: number }>
}

const LEGACY_DEFAULT_HARDWARE = {
  deviceName: 'DESKTOP-U09K1H5',
  hostIp: '172.25.254.247',
  macAddress: '88-B1-11-1B-9D-9E',
  webglVendor: 'Google Inc. (NVIDIA)',
  webglRenderer:
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Ti Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.15.4633)',
}

const HARDWARE_ARCHETYPES: HardwareArchetype[] = [
  {
    id: 'macbook-pro',
    operatingSystem: 'macOS',
    browserVersions: ['136', '137', '138'],
    resolutions: [
      { width: 1440, height: 900 },
      { width: 1512, height: 982 },
      { width: 1680, height: 1050 },
      { width: 1728, height: 1117 },
    ],
    cpuOptions: [8, 10, 12],
    memoryOptions: [8, 16, 18],
    webgl: [
      { vendor: 'Apple Inc.', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
      { vendor: 'Apple Inc.', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)' },
      { vendor: 'Apple Inc.', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' },
      { vendor: 'Apple Inc.', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)' },
    ],
    deviceNamePrefix: ['MacBook-Pro', 'MacBook-Air', 'Studio-Mac'],
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 10 },
      { first: 192, second: 168 },
    ],
  },
  {
    id: 'windows-office',
    operatingSystem: 'Windows',
    browserVersions: ['136', '137', '138'],
    resolutions: [
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
    ],
    cpuOptions: [4, 6, 8],
    memoryOptions: [8, 12, 16],
    webgl: [
      { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    ],
    deviceNamePrefix: ['DESKTOP', 'OFFICE', 'WORKSTATION'],
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 1 },
      { first: 192, second: 168 },
    ],
  },
  {
    id: 'windows-home',
    operatingSystem: 'Windows',
    browserVersions: ['136', '137', '138', '139'],
    resolutions: [
      { width: 1600, height: 900 },
      { width: 1920, height: 1080 },
      { width: 2560, height: 1440 },
    ],
    cpuOptions: [8, 12, 16],
    memoryOptions: [16, 24, 32],
    webgl: [
      { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
      { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    ],
    deviceNamePrefix: ['DESKTOP', 'GAMING-PC', 'HOME-PC'],
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 8 },
      { first: 192, second: 168 },
    ],
  },
]

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function createRng(seedValue: string): () => number {
  let state = hashString(seedValue) || 0x12345678
  return () => {
    state += 0x6d2b79f5
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickOne<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)] ?? items[0]
}

function buildDesktopUserAgent(operatingSystem: string, browserVersion: string): string {
  const majorVersion = String(browserVersion || '136').trim() || '136'
  const normalized = operatingSystem.toLowerCase()
  if (normalized.includes('mac')) {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${majorVersion}.0.0.0 Safari/537.36`
}

function formatWindowsDeviceName(prefix: string, rng: () => number): string {
  const suffix = Math.floor(rng() * 0xfffffff)
    .toString(36)
    .toUpperCase()
    .padStart(7, '0')
    .slice(0, 7)
  return `${prefix}-${suffix}`
}

function formatMacDeviceName(prefix: string, rng: () => number): string {
  const suffix = Math.floor(rng() * 0xffff)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0')
  return `${prefix}-${suffix}`
}

function buildDeviceName(archetype: HardwareArchetype, rng: () => number): string {
  const prefix = pickOne(archetype.deviceNamePrefix, rng)
  if (archetype.operatingSystem === 'macOS') {
    return formatMacDeviceName(prefix, rng)
  }
  return formatWindowsDeviceName(prefix, rng)
}

function buildPrivateHostIp(archetype: HardwareArchetype, rng: () => number): string {
  const range = pickOne(archetype.hostIpRanges, rng)
  if (range.first === 192) {
    return `${range.first}.${range.second}.${Math.floor(rng() * 30) + 1}.${Math.floor(rng() * 220) + 10}`
  }
  return `${range.first}.${range.second}.${Math.floor(rng() * 32)}.${Math.floor(rng() * 220) + 10}`
}

function buildMacAddress(rng: () => number): string {
  const firstOctet = pickOne([0x02, 0x06, 0x0a, 0x0e], rng)
  const octets = [firstOctet]
  for (let index = 0; index < 5; index += 1) {
    octets.push(Math.floor(rng() * 256))
  }
  return octets.map((value) => value.toString(16).padStart(2, '0').toUpperCase()).join('-')
}

function isMeaningfullyEmpty(value: string | null | undefined): boolean {
  return String(value || '').trim().length === 0
}

function isLegacyDefaultHardwareIdentity(config: FingerprintConfig): boolean {
  return (
    config.advanced.deviceName === LEGACY_DEFAULT_HARDWARE.deviceName &&
    config.advanced.hostIp === LEGACY_DEFAULT_HARDWARE.hostIp &&
    config.advanced.macAddress === LEGACY_DEFAULT_HARDWARE.macAddress &&
    config.advanced.webglVendor === LEGACY_DEFAULT_HARDWARE.webglVendor &&
    config.advanced.webglRenderer === LEGACY_DEFAULT_HARDWARE.webglRenderer
  )
}

function needsGeneratedHardwareIdentity(config: FingerprintConfig): boolean {
  return (
    isMeaningfullyEmpty(config.advanced.deviceName) ||
    isMeaningfullyEmpty(config.advanced.hostIp) ||
    isMeaningfullyEmpty(config.advanced.macAddress) ||
    isMeaningfullyEmpty(config.advanced.webglVendor) ||
    isMeaningfullyEmpty(config.advanced.webglRenderer)
  )
}

function buildStableHardwareFingerprint(
  seedValue: string,
  preferredOperatingSystem?: string,
): {
  archetypeId: string
  operatingSystem: string
  browserVersion: string
  userAgent: string
  width: number
  height: number
  resolution: string
  cpuCores: number
  memoryGb: number
  webglVendor: string
  webglRenderer: string
  deviceName: string
  hostIp: string
  macAddress: string
} {
  const rng = createRng(seedValue)
  const archetypePool = preferredOperatingSystem?.toLowerCase().includes('mac')
    ? HARDWARE_ARCHETYPES.filter((item) => item.operatingSystem === 'macOS')
    : preferredOperatingSystem?.toLowerCase().includes('win')
      ? HARDWARE_ARCHETYPES.filter((item) => item.operatingSystem === 'Windows')
      : HARDWARE_ARCHETYPES
  const archetype = pickOne(archetypePool, rng)
  const browserVersion = pickOne(archetype.browserVersions, rng)
  const resolution = pickOne(archetype.resolutions, rng)
  const webgl = pickOne(archetype.webgl, rng)
  const cpuCores = pickOne(archetype.cpuOptions, rng)
  const memoryGb = pickOne(archetype.memoryOptions, rng)

  return {
    archetypeId: archetype.id,
    operatingSystem: archetype.operatingSystem,
    browserVersion,
    userAgent: buildDesktopUserAgent(archetype.operatingSystem, browserVersion),
    width: resolution.width,
    height: resolution.height,
    resolution: `${resolution.width}x${resolution.height}`,
    cpuCores,
    memoryGb,
    webglVendor: webgl.vendor,
    webglRenderer: webgl.renderer,
    deviceName: buildDeviceName(archetype, rng),
    hostIp: buildPrivateHostIp(archetype, rng),
    macAddress: buildMacAddress(rng),
  }
}

function markHardwareProfile(
  config: FingerprintConfig,
  source: HardwareProfileSource,
  profileId: string,
  seedValue: string,
): FingerprintConfig {
  return {
    ...config,
    runtimeMetadata: {
      ...config.runtimeMetadata,
      hardwareProfileId: `${source}:${profileId}`,
      hardwareProfileVersion: STABLE_HARDWARE_PROFILE_VERSION,
      hardwareSeed: seedValue,
      hardwareProfileSource: source,
    },
  }
}

export function assignStableHardwareFingerprint(
  config: FingerprintConfig,
  profileId: string,
  options?: {
    forceRegenerate?: boolean
    seed?: string
  },
): FingerprintConfig {
  const currentSource = config.runtimeMetadata.hardwareProfileSource
  const hasStableGeneratedProfile =
    currentSource === 'generated' &&
    config.runtimeMetadata.hardwareProfileVersion === STABLE_HARDWARE_PROFILE_VERSION

  if (!options?.forceRegenerate) {
    if (currentSource === 'manual') {
      return markHardwareProfile(config, 'manual', profileId, config.runtimeMetadata.hardwareSeed || `manual:${profileId}`)
    }
    if (hasStableGeneratedProfile) {
      return config
    }
    if (!isLegacyDefaultHardwareIdentity(config) && !needsGeneratedHardwareIdentity(config) && currentSource !== 'template') {
      return markHardwareProfile(config, 'manual', profileId, `manual:${profileId}`)
    }
  }

  const seedValue = options?.seed || config.runtimeMetadata.hardwareSeed || profileId
  const generated = buildStableHardwareFingerprint(seedValue, config.advanced.operatingSystem)
  return {
    ...config,
    userAgent: generated.userAgent,
    resolution: generated.resolution,
    advanced: {
      ...config.advanced,
      operatingSystem: generated.operatingSystem,
      browserVersion: generated.browserVersion,
      windowWidth: generated.width,
      windowHeight: generated.height,
      webglMetadataMode: 'custom',
      webglVendor: generated.webglVendor,
      webglRenderer: generated.webglRenderer,
      deviceInfoMode: 'custom',
      deviceName: generated.deviceName,
      hostIp: generated.hostIp,
      macAddress: generated.macAddress,
      cpuMode: 'custom',
      cpuCores: generated.cpuCores,
      memoryGb: generated.memoryGb,
    },
    runtimeMetadata: {
      ...config.runtimeMetadata,
      hardwareProfileId: `generated:${profileId}:${generated.archetypeId}`,
      hardwareProfileVersion: STABLE_HARDWARE_PROFILE_VERSION,
      hardwareSeed: seedValue,
      hardwareProfileSource: 'generated',
    },
  }
}

export function randomizeStableHardwareFingerprint(config: FingerprintConfig): FingerprintConfig {
  const seed = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return assignStableHardwareFingerprint(config, seed, {
    forceRegenerate: true,
    seed,
  })
}

export function sanitizeTemplateHardwareFingerprint(config: FingerprintConfig): FingerprintConfig {
  return {
    ...config,
    runtimeMetadata: {
      ...config.runtimeMetadata,
      hardwareProfileId: '',
      hardwareProfileVersion: '',
      hardwareSeed: '',
      hardwareProfileSource: 'template',
    },
  }
}

export function shouldMigrateStableHardwareFingerprint(config: FingerprintConfig): boolean {
  if (config.runtimeMetadata.hardwareProfileVersion === STABLE_HARDWARE_PROFILE_VERSION) {
    return false
  }
  if (config.runtimeMetadata.hardwareProfileSource === 'manual') {
    return false
  }
  return isLegacyDefaultHardwareIdentity(config) || needsGeneratedHardwareIdentity(config)
}
