import type { FingerprintConfig } from './types'

export const STABLE_HARDWARE_PROFILE_VERSION = 'desktop-hw-v2'
export const HARDWARE_CATALOG_VERSION = 'hw-catalog-v1'

type HardwareProfileSource = NonNullable<FingerprintConfig['runtimeMetadata']['hardwareProfileSource']>

type DevicePlatform = 'Windows' | 'macOS'
type DeviceTemplateFamily = 'mac_air' | 'mac_pro' | 'win_business' | 'win_home' | 'win_performance'
type DeviceNameStyle = 'mac_air' | 'mac_pro' | 'windows_laptop' | 'windows_desktop'

type HostIpRange = {
  first: number
  second: number
}

export type DeviceTemplateVariant = {
  id: string
  cpuCores: number
  memoryGb: number
  webglVendor: string
  webglRenderer: string
  resolutions: string[]
}

export type DeviceTemplate = {
  id: string
  platform: DevicePlatform
  family: DeviceTemplateFamily
  model: string
  weight: number
  browserMajors: string[]
  deviceNameStyle: DeviceNameStyle
  hostIpRanges: HostIpRange[]
  variants: DeviceTemplateVariant[]
}

type GeneratedHardwareFingerprint = {
  templateId: string
  variantId: string
  catalogVersion: string
  operatingSystem: DevicePlatform
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
}

const MAX_TEMPLATE_RETRIES = 12
const DEFAULT_TEMPLATE_ID = 'mac_air_m2_13'
const CURRENT_BROWSER_MAJORS = ['146', '147'] as const

const LEGACY_DEFAULT_HARDWARE = {
  deviceName: 'DESKTOP-U09K1H5',
  hostIp: '172.25.254.247',
  macAddress: '88-B1-11-1B-9D-9E',
  webglVendor: 'Google Inc. (NVIDIA)',
  webglRenderer:
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Ti Direct3D11 vs_5_0 ps_5_0, D3D11-31.0.15.4633)',
}

const DEVICE_TEMPLATES: DeviceTemplate[] = [
  {
    id: 'mac_air_m1_13',
    platform: 'macOS',
    family: 'mac_air',
    model: 'MacBook Air 13 M1',
    weight: 16,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'mac_air',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 10 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'm1-8c-8g',
        cpuCores: 8,
        memoryGb: 8,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
        resolutions: ['1440x900', '1680x1050'],
      },
      {
        id: 'm1-8c-16g',
        cpuCores: 8,
        memoryGb: 16,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
        resolutions: ['1440x900', '1680x1050'],
      },
    ],
  },
  {
    id: 'mac_air_m2_13',
    platform: 'macOS',
    family: 'mac_air',
    model: 'MacBook Air 13 M2',
    weight: 18,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'mac_air',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 10 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'm2-8c-8g',
        cpuCores: 8,
        memoryGb: 8,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
        resolutions: ['1496x968', '1680x1050', '1710x1112'],
      },
      {
        id: 'm2-8c-16g',
        cpuCores: 8,
        memoryGb: 16,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
        resolutions: ['1496x968', '1680x1050', '1710x1112'],
      },
      {
        id: 'm2-8c-24g',
        cpuCores: 8,
        memoryGb: 24,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
        resolutions: ['1496x968', '1680x1050', '1710x1112'],
      },
    ],
  },
  {
    id: 'mac_air_m3_13',
    platform: 'macOS',
    family: 'mac_air',
    model: 'MacBook Air 13 M3',
    weight: 14,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'mac_air',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 10 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'm3-8c-8g',
        cpuCores: 8,
        memoryGb: 8,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
        resolutions: ['1496x968', '1710x1112'],
      },
      {
        id: 'm3-8c-16g',
        cpuCores: 8,
        memoryGb: 16,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
        resolutions: ['1496x968', '1710x1112'],
      },
      {
        id: 'm3-8c-24g',
        cpuCores: 8,
        memoryGb: 24,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
        resolutions: ['1496x968', '1710x1112'],
      },
    ],
  },
  {
    id: 'mac_pro_14_m3',
    platform: 'macOS',
    family: 'mac_pro',
    model: 'MacBook Pro 14 M3',
    weight: 10,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'mac_pro',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 10 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'm3-8c-8g',
        cpuCores: 8,
        memoryGb: 8,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
        resolutions: ['1512x982', '1728x1117'],
      },
      {
        id: 'm3-8c-16g',
        cpuCores: 8,
        memoryGb: 16,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
        resolutions: ['1512x982', '1728x1117'],
      },
      {
        id: 'm3-8c-24g',
        cpuCores: 8,
        memoryGb: 24,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
        resolutions: ['1512x982', '1728x1117'],
      },
    ],
  },
  {
    id: 'mac_pro_14_m3_pro',
    platform: 'macOS',
    family: 'mac_pro',
    model: 'MacBook Pro 14 M3 Pro',
    weight: 8,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'mac_pro',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 10 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'm3pro-11c-18g',
        cpuCores: 11,
        memoryGb: 18,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
        resolutions: ['1512x982', '1728x1117'],
      },
      {
        id: 'm3pro-12c-18g',
        cpuCores: 12,
        memoryGb: 18,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
        resolutions: ['1512x982', '1728x1117'],
      },
      {
        id: 'm3pro-11c-36g',
        cpuCores: 11,
        memoryGb: 36,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
        resolutions: ['1512x982', '1728x1117'],
      },
      {
        id: 'm3pro-12c-36g',
        cpuCores: 12,
        memoryGb: 36,
        webglVendor: 'Apple Inc.',
        webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)',
        resolutions: ['1512x982', '1728x1117'],
      },
    ],
  },
  {
    id: 'win_business_latitude_5440',
    platform: 'Windows',
    family: 'win_business',
    model: 'Dell Latitude 5440',
    weight: 12,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'windows_laptop',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 1 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'u5-4c-8g-uhd',
        cpuCores: 4,
        memoryGb: 8,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1080', '1920x1200'],
      },
      {
        id: 'u5-6c-16g-irisxe',
        cpuCores: 6,
        memoryGb: 16,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1080', '1920x1200'],
      },
      {
        id: 'u7-8c-32g-irisxe',
        cpuCores: 8,
        memoryGb: 32,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1080', '1920x1200'],
      },
    ],
  },
  {
    id: 'win_business_thinkpad_e14_g5',
    platform: 'Windows',
    family: 'win_business',
    model: 'ThinkPad E14 Gen 5',
    weight: 11,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'windows_laptop',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 2 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'i5-4c-8g-uhd',
        cpuCores: 4,
        memoryGb: 8,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1200'],
      },
      {
        id: 'i5-6c-16g-irisxe',
        cpuCores: 6,
        memoryGb: 16,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1200', '2240x1400'],
      },
      {
        id: 'i7-8c-24g-irisxe',
        cpuCores: 8,
        memoryGb: 24,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1200', '2240x1400'],
      },
    ],
  },
  {
    id: 'win_business_thinkpad_t14_g4',
    platform: 'Windows',
    family: 'win_business',
    model: 'ThinkPad T14 Gen 4',
    weight: 10,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'windows_laptop',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 4 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'i5-6c-16g-irisxe',
        cpuCores: 6,
        memoryGb: 16,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1200'],
      },
      {
        id: 'i7-8c-16g-irisxe',
        cpuCores: 8,
        memoryGb: 16,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1200', '2240x1400'],
      },
      {
        id: 'u7-10c-32g-irisxe',
        cpuCores: 10,
        memoryGb: 32,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1200', '2240x1400'],
      },
    ],
  },
  {
    id: 'win_home_inspiron_14_5430',
    platform: 'Windows',
    family: 'win_home',
    model: 'Inspiron 14 5430',
    weight: 7,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'windows_laptop',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 8 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'i5-6c-8g-uhd',
        cpuCores: 6,
        memoryGb: 8,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1200'],
      },
      {
        id: 'i7-8c-16g-irisxe',
        cpuCores: 8,
        memoryGb: 16,
        webglVendor: 'Google Inc. (Intel)',
        webglRenderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1200'],
      },
    ],
  },
  {
    id: 'win_performance_mid_rtx',
    platform: 'Windows',
    family: 'win_performance',
    model: 'Windows Performance Mid RTX',
    weight: 4,
    browserMajors: [...CURRENT_BROWSER_MAJORS],
    deviceNameStyle: 'windows_desktop',
    hostIpRanges: [
      { first: 10, second: 0 },
      { first: 10, second: 16 },
      { first: 192, second: 168 },
    ],
    variants: [
      {
        id: 'rtx1650-8c-16g',
        cpuCores: 8,
        memoryGb: 16,
        webglVendor: 'Google Inc. (NVIDIA)',
        webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1080', '2560x1440'],
      },
      {
        id: 'rtx3060-12c-32g',
        cpuCores: 12,
        memoryGb: 32,
        webglVendor: 'Google Inc. (NVIDIA)',
        webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1080', '2560x1440'],
      },
      {
        id: 'rx6600xt-16c-32g',
        cpuCores: 16,
        memoryGb: 32,
        webglVendor: 'Google Inc. (AMD)',
        webglRenderer: 'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
        resolutions: ['1920x1080', '2560x1440'],
      },
    ],
  },
]

const DEFAULT_TEMPLATE = DEVICE_TEMPLATES.find((template) => template.id === DEFAULT_TEMPLATE_ID) ?? DEVICE_TEMPLATES[0]

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

function pickWeightedTemplate(templates: DeviceTemplate[], rng: () => number): DeviceTemplate {
  const totalWeight = templates.reduce((sum, template) => sum + Math.max(0, template.weight), 0)
  if (totalWeight <= 0) {
    return templates[0] ?? DEFAULT_TEMPLATE
  }

  let cursor = rng() * totalWeight
  for (const template of templates) {
    cursor -= Math.max(0, template.weight)
    if (cursor < 0) {
      return template
    }
  }

  return templates[templates.length - 1] ?? DEFAULT_TEMPLATE
}

function parseResolution(value: string): { width: number; height: number } {
  const [rawWidth, rawHeight] = String(value).split('x')
  return {
    width: Math.max(1, Number(rawWidth) || 1),
    height: Math.max(1, Number(rawHeight) || 1),
  }
}

function buildDesktopUserAgent(operatingSystem: DevicePlatform, browserVersion: string): string {
  const majorVersion = String(browserVersion || '147').trim() || '147'
  if (operatingSystem === 'macOS') {
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

function buildDeviceName(style: DeviceNameStyle, rng: () => number): string {
  if (style === 'mac_air') {
    return formatMacDeviceName('MacBook-Air', rng)
  }
  if (style === 'mac_pro') {
    return formatMacDeviceName('MacBook-Pro', rng)
  }
  if (style === 'windows_laptop') {
    return formatWindowsDeviceName('LAPTOP', rng)
  }
  return formatWindowsDeviceName('DESKTOP', rng)
}

function buildPrivateHostIp(ranges: HostIpRange[], rng: () => number): string {
  const range = pickOne(ranges, rng)
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

function findTemplateById(templateId: string): DeviceTemplate | null {
  return DEVICE_TEMPLATES.find((template) => template.id === templateId) ?? null
}

function isMacAirTemplate(templateId: string): boolean {
  return templateId.startsWith('mac_air_')
}

function isMacProTemplate(templateId: string): boolean {
  return templateId.startsWith('mac_pro_')
}

function isMacRendererFor(templateId: string, renderer: string): boolean {
  if (templateId === 'mac_air_m1_13') return renderer.includes('Apple M1')
  if (templateId === 'mac_air_m2_13') return renderer.includes('Apple M2')
  if (templateId === 'mac_air_m3_13' || templateId === 'mac_pro_14_m3') {
    return renderer.includes('Apple M3') && !renderer.includes('M3 Pro')
  }
  if (templateId === 'mac_pro_14_m3_pro') return renderer.includes('Apple M3 Pro')
  return true
}

function isValidHardwareTemplateVariant(template: DeviceTemplate, variant: DeviceTemplateVariant): boolean {
  if (!template.browserMajors.length || !variant.resolutions.length) {
    return false
  }

  if (template.platform === 'macOS') {
    if (variant.memoryGb === 18 || variant.memoryGb === 36) {
      if (template.id !== 'mac_pro_14_m3_pro') {
        return false
      }
    }
    if (!isMacRendererFor(template.id, variant.webglRenderer)) {
      return false
    }
    if (isMacAirTemplate(template.id) && variant.resolutions.some((resolution) => ['1512x982', '1728x1117'].includes(resolution))) {
      return false
    }
    if (isMacProTemplate(template.id) && variant.resolutions.some((resolution) => ['1440x900', '1680x1050'].includes(resolution))) {
      return false
    }
  }

  if (template.family === 'win_business') {
    if (!/UHD|Iris\(R\) Xe|Iris Xe/i.test(variant.webglRenderer)) {
      return false
    }
  }

  if (template.family !== 'win_performance' && /(RTX|GTX|Radeon)/i.test(variant.webglRenderer)) {
    return false
  }

  if (template.family === 'win_performance') {
    if (!/(RTX|GTX|Radeon)/i.test(variant.webglRenderer)) {
      return false
    }
    if (variant.cpuCores < 8 || variant.memoryGb < 16) {
      return false
    }
  }

  return true
}

function validateGeneratedHardwareFingerprint(
  template: DeviceTemplate,
  variant: DeviceTemplateVariant,
  browserVersion: string,
  resolution: string,
): boolean {
  if (!template.browserMajors.includes(browserVersion)) {
    return false
  }
  if (!variant.resolutions.includes(resolution)) {
    return false
  }
  return isValidHardwareTemplateVariant(template, variant)
}

function generateFingerprintFromTemplate(
  template: DeviceTemplate,
  variant: DeviceTemplateVariant,
  browserVersion: string,
  resolution: string,
  rng: () => number,
): GeneratedHardwareFingerprint {
  const parsedResolution = parseResolution(resolution)
  return {
    templateId: template.id,
    variantId: variant.id,
    catalogVersion: HARDWARE_CATALOG_VERSION,
    operatingSystem: template.platform,
    browserVersion,
    userAgent: buildDesktopUserAgent(template.platform, browserVersion),
    width: parsedResolution.width,
    height: parsedResolution.height,
    resolution,
    cpuCores: variant.cpuCores,
    memoryGb: variant.memoryGb,
    webglVendor: variant.webglVendor,
    webglRenderer: variant.webglRenderer,
    deviceName: buildDeviceName(template.deviceNameStyle, rng),
    hostIp: buildPrivateHostIp(template.hostIpRanges, rng),
    macAddress: buildMacAddress(rng),
  }
}

function buildStableHardwareFingerprint(
  seedValue: string,
  preferredOperatingSystem?: string,
  preferredBrowserVersion?: string,
): GeneratedHardwareFingerprint {
  const rng = createRng(seedValue)
  const templatePool = preferredOperatingSystem?.toLowerCase().includes('mac')
    ? DEVICE_TEMPLATES.filter((item) => item.platform === 'macOS')
    : preferredOperatingSystem?.toLowerCase().includes('win')
      ? DEVICE_TEMPLATES.filter((item) => item.platform === 'Windows')
      : DEVICE_TEMPLATES

  const candidates = templatePool.length > 0 ? templatePool : DEVICE_TEMPLATES

  for (let attempt = 0; attempt < MAX_TEMPLATE_RETRIES; attempt += 1) {
    const template = pickWeightedTemplate(candidates, rng)
    const validVariants = template.variants.filter((variant) => isValidHardwareTemplateVariant(template, variant))
    if (validVariants.length === 0) {
      continue
    }
    const variant = pickOne(validVariants, rng)
    const browserVersion =
      preferredBrowserVersion && template.browserMajors.includes(preferredBrowserVersion) ?
        preferredBrowserVersion
      : pickOne(template.browserMajors, rng)
    const resolution = pickOne(variant.resolutions, rng)
    if (validateGeneratedHardwareFingerprint(template, variant, browserVersion, resolution)) {
      return generateFingerprintFromTemplate(template, variant, browserVersion, resolution, rng)
    }
  }

  const fallbackVariant = DEFAULT_TEMPLATE.variants.find((variant) => isValidHardwareTemplateVariant(DEFAULT_TEMPLATE, variant))
    ?? DEFAULT_TEMPLATE.variants[0]
  const fallbackBrowserVersion =
    (preferredBrowserVersion && DEFAULT_TEMPLATE.browserMajors.includes(preferredBrowserVersion) ? preferredBrowserVersion : null) ??
    DEFAULT_TEMPLATE.browserMajors[DEFAULT_TEMPLATE.browserMajors.length - 1] ??
    '147'
  const fallbackResolution = fallbackVariant?.resolutions[0] ?? '1680x1050'

  return generateFingerprintFromTemplate(
    DEFAULT_TEMPLATE,
    fallbackVariant,
    fallbackBrowserVersion,
    fallbackResolution,
    rng,
  )
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
      hardwareTemplateId: '',
      hardwareVariantId: '',
      hardwareCatalogVersion: '',
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
    config.runtimeMetadata.hardwareProfileVersion === STABLE_HARDWARE_PROFILE_VERSION &&
    config.runtimeMetadata.hardwareCatalogVersion === HARDWARE_CATALOG_VERSION &&
    !isMeaningfullyEmpty(config.runtimeMetadata.hardwareTemplateId) &&
    !isMeaningfullyEmpty(config.runtimeMetadata.hardwareVariantId)

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
  const generated = buildStableHardwareFingerprint(
    seedValue,
    config.advanced.operatingSystem,
    String(config.advanced.browserVersion || '').trim() || undefined,
  )

  return {
    ...config,
    userAgent: generated.userAgent,
    resolution: generated.resolution,
    advanced: {
      ...config.advanced,
      operatingSystem: generated.operatingSystem,
      browserKernelVersion: generated.browserVersion,
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
      hardwareProfileId: `generated:${profileId}:${generated.templateId}:${generated.variantId}`,
      hardwareProfileVersion: STABLE_HARDWARE_PROFILE_VERSION,
      hardwareSeed: seedValue,
      hardwareProfileSource: 'generated',
      hardwareTemplateId: generated.templateId,
      hardwareVariantId: generated.variantId,
      hardwareCatalogVersion: generated.catalogVersion,
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
      hardwareTemplateId: '',
      hardwareVariantId: '',
      hardwareCatalogVersion: '',
    },
  }
}

export function shouldMigrateStableHardwareFingerprint(config: FingerprintConfig): boolean {
  if (config.runtimeMetadata.hardwareProfileSource === 'manual') {
    return false
  }

  if (config.runtimeMetadata.hardwareProfileVersion === STABLE_HARDWARE_PROFILE_VERSION) {
    if (config.runtimeMetadata.hardwareCatalogVersion === HARDWARE_CATALOG_VERSION) {
      const template = findTemplateById(config.runtimeMetadata.hardwareTemplateId)
      const variant = template?.variants.find((item) => item.id === config.runtimeMetadata.hardwareVariantId)
      return !(template && variant && isValidHardwareTemplateVariant(template, variant))
    }
  }

  if (config.runtimeMetadata.hardwareProfileSource === 'generated') {
    return true
  }

  return isLegacyDefaultHardwareIdentity(config) || needsGeneratedHardwareIdentity(config)
}
