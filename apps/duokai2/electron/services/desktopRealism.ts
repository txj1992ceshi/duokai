import type { FingerprintConfig } from '../../src/shared/types'

export type DesktopTemplateFamily =
  | 'mac_air'
  | 'mac_pro'
  | 'win_business'
  | 'win_home'
  | 'win_performance'
  | 'unknown'

export interface FontBaseline {
  templateFamily: DesktopTemplateFamily
  operatingSystem: 'macOS' | 'Windows' | 'Linux'
  supportedFamilies: string[]
  genericFamilies: string[]
  defaultFontFamily: string
  metricsSalt: string
}

export interface UserAgentBrandVersion {
  brand: string
  version: string
}

export interface DeviceInfoBaseline {
  templateFamily: DesktopTemplateFamily
  platform: string
  platformVersion: string
  architecture: string
  bitness: string
  model: string
  mobile: boolean
  wow64: boolean
  maxTouchPoints: number
  pdfViewerEnabled: boolean
  brands: UserAgentBrandVersion[]
  fullVersionList: UserAgentBrandVersion[]
  uaFullVersion: string
  formFactors: string[]
}

const WINDOWS_GENERIC_FAMILIES = ['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-sans-serif']
const MAC_GENERIC_FAMILIES = ['serif', 'sans-serif', 'monospace', 'system-ui', 'ui-sans-serif']

const WINDOWS_FONT_BASELINES: Record<
  Exclude<DesktopTemplateFamily, 'mac_air' | 'mac_pro' | 'unknown'>,
  string[]
> = {
  win_business: [
    'Segoe UI',
    'Segoe UI Variable Text',
    'Segoe UI Emoji',
    'Segoe Fluent Icons',
    'Aptos',
    'Calibri',
    'Cambria',
    'Candara',
    'Consolas',
    'Courier New',
    'Arial',
    'Arial Black',
    'Georgia',
    'Tahoma',
    'Trebuchet MS',
    'Verdana',
    'Times New Roman',
    'Microsoft YaHei',
    'SimSun',
    'Malgun Gothic',
    'Meiryo',
  ],
  win_home: [
    'Segoe UI',
    'Segoe UI Emoji',
    'Segoe UI Variable Text',
    'Calibri',
    'Cambria',
    'Candara',
    'Consolas',
    'Courier New',
    'Arial',
    'Arial Black',
    'Georgia',
    'Tahoma',
    'Trebuchet MS',
    'Verdana',
    'Times New Roman',
    'Microsoft YaHei',
    'SimSun',
    'Malgun Gothic',
    'Meiryo',
  ],
  win_performance: [
    'Segoe UI',
    'Segoe UI Variable Text',
    'Segoe UI Emoji',
    'Segoe Fluent Icons',
    'Bahnschrift',
    'Aptos',
    'Calibri',
    'Cambria',
    'Consolas',
    'Courier New',
    'Arial',
    'Arial Black',
    'Georgia',
    'Tahoma',
    'Trebuchet MS',
    'Verdana',
    'Times New Roman',
    'Microsoft YaHei',
    'SimSun',
    'Malgun Gothic',
    'Meiryo',
  ],
}

const MAC_FONT_BASELINES: Record<Extract<DesktopTemplateFamily, 'mac_air' | 'mac_pro'>, string[]> = {
  mac_air: [
    '-apple-system',
    'BlinkMacSystemFont',
    'SF Pro Text',
    'SF Pro Display',
    'Helvetica Neue',
    'Helvetica',
    'Arial',
    'Times New Roman',
    'Courier New',
    'Menlo',
    'Monaco',
    'PingFang SC',
    'PingFang TC',
    'Hiragino Sans',
    'Hiragino Kaku Gothic ProN',
    'Apple Color Emoji',
  ],
  mac_pro: [
    '-apple-system',
    'BlinkMacSystemFont',
    'SF Pro Text',
    'SF Pro Display',
    'Helvetica Neue',
    'Helvetica',
    'Arial',
    'Times New Roman',
    'Courier New',
    'Menlo',
    'Monaco',
    'PingFang SC',
    'PingFang TC',
    'Hiragino Sans',
    'Hiragino Kaku Gothic ProN',
    'Apple Color Emoji',
  ],
}

function parseChromeMajor(config: FingerprintConfig): string {
  const configured = String(config.advanced.browserVersion || '').trim()
  if (configured) {
    return configured.split('.')[0] || configured
  }
  return config.userAgent.match(/Chrome\/(\d+)/i)?.[1] || '147'
}

export function resolveDesktopTemplateFamily(config: FingerprintConfig): DesktopTemplateFamily {
  const templateId = String(config.runtimeMetadata.hardwareTemplateId || '').trim().toLowerCase()
  if (templateId.startsWith('mac_air_')) return 'mac_air'
  if (templateId.startsWith('mac_pro_')) return 'mac_pro'
  if (templateId.startsWith('win_business_')) return 'win_business'
  if (templateId.startsWith('win_home_')) return 'win_home'
  if (templateId.startsWith('win_performance_')) return 'win_performance'

  const operatingSystem = String(config.advanced.operatingSystem || '').trim().toLowerCase()
  if (operatingSystem.includes('mac')) return 'mac_air'
  if (operatingSystem.includes('windows')) return 'win_business'
  return 'unknown'
}

export function resolveFontBaseline(config: FingerprintConfig): FontBaseline {
  const templateFamily = resolveDesktopTemplateFamily(config)
  if (templateFamily === 'mac_air' || templateFamily === 'mac_pro') {
    return {
      templateFamily,
      operatingSystem: 'macOS',
      supportedFamilies: MAC_FONT_BASELINES[templateFamily],
      genericFamilies: MAC_GENERIC_FAMILIES,
      defaultFontFamily: '-apple-system',
      metricsSalt: templateFamily,
    }
  }

  if (
    templateFamily === 'win_business' ||
    templateFamily === 'win_home' ||
    templateFamily === 'win_performance'
  ) {
    return {
      templateFamily,
      operatingSystem: 'Windows',
      supportedFamilies: WINDOWS_FONT_BASELINES[templateFamily],
      genericFamilies: WINDOWS_GENERIC_FAMILIES,
      defaultFontFamily: 'Segoe UI',
      metricsSalt: templateFamily,
    }
  }

  return {
    templateFamily,
    operatingSystem: 'Linux',
    supportedFamilies: ['Arial', 'Helvetica', 'Times New Roman', 'Courier New', 'Noto Sans', 'Noto Serif'],
    genericFamilies: ['serif', 'sans-serif', 'monospace', 'system-ui'],
    defaultFontFamily: 'Arial',
    metricsSalt: 'linux',
  }
}

export function resolveDeviceInfoBaseline(config: FingerprintConfig): DeviceInfoBaseline {
  const templateFamily = resolveDesktopTemplateFamily(config)
  const chromeMajor = parseChromeMajor(config)
  const uaFullVersion = `${chromeMajor}.0.0.0`
  const brands = [
    { brand: 'Not.A/Brand', version: '24' },
    { brand: 'Chromium', version: chromeMajor },
    { brand: 'Google Chrome', version: chromeMajor },
  ]
  const fullVersionList = [
    { brand: 'Not.A/Brand', version: '24.0.0.0' },
    { brand: 'Chromium', version: uaFullVersion },
    { brand: 'Google Chrome', version: uaFullVersion },
  ]

  if (templateFamily === 'mac_air' || templateFamily === 'mac_pro') {
    return {
      templateFamily,
      platform: 'macOS',
      platformVersion: '10.15.7',
      architecture: 'arm',
      bitness: '64',
      model: '',
      mobile: false,
      wow64: false,
      maxTouchPoints: 0,
      pdfViewerEnabled: true,
      brands,
      fullVersionList,
      uaFullVersion,
      formFactors: ['Desktop'],
    }
  }

  return {
    templateFamily,
    platform: 'Windows',
    platformVersion: '10.0.0',
    architecture: 'x86',
    bitness: '64',
    model: '',
    mobile: false,
    wow64: false,
    maxTouchPoints: 0,
    pdfViewerEnabled: true,
    brands,
    fullVersionList,
    uaFullVersion,
    formFactors: ['Desktop'],
  }
}
