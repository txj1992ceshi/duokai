import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { mkdirSync, rmSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { FingerprintConfig } from '../src/shared/types.ts'
import {
  applyCloakFingerprintMappingToLaunchRequest,
  buildCloakFingerprintMapping,
  type CloakFingerprintMapping,
} from '../electron/services/cloakBrowserFingerprint.ts'
import {
  closeCloakContextSafely,
  launchCloakPersistentContext,
  type CloakBrowserContextLike,
  type CloakBrowserPageLike,
  type CloakRuntimeLaunchRequest,
} from '../electron/services/cloakBrowserRuntime.ts'

interface FingerprintProbe {
  userAgent: string
  platform: string
  language: string
  languages: string[]
  hardwareConcurrency: number
  deviceMemory: number | null
  webdriver: boolean | null
  timezone: string
  timezoneOffset: number
  screen: {
    width: number
    height: number
    availWidth: number
    availHeight: number
    colorDepth: number
    pixelDepth: number
  }
  userAgentData: Record<string, unknown> | null
  webgl: {
    vendor: string
    renderer: string
  }
  canvasHash: string
  canvasPixelHash: string
  audioChecksum: number | null
  clientRect: {
    x: number
    y: number
    width: number
    height: number
  }
  fonts: Record<string, boolean>
  geolocation: {
    latitude: number
    longitude: number
    accuracy: number
  } | null
  geolocationError: string
  legacyInjectionPresent: boolean
}

interface FingerprintSmokeReport {
  success: boolean
  startedAt: string
  finishedAt: string
  browserVersion: string
  mapping: {
    fingerprintSeed: number
    mappingHash: string
    args: string[]
    warnings: string[]
  }
  sameSeedStable: boolean
  differentSeedDistinct: boolean
  nativeIdentityMatches: boolean
  geolocationMatches: boolean
  legacyInjectionAbsent: boolean
  firstProbe: FingerprintProbe | null
  secondProbe: FingerprintProbe | null
  differentSeedProbe: FingerprintProbe | null
  identity: Record<string, unknown> | null
  retainedRoot: string
  failures: Array<{ stage: string; message: string }>
}

function buildFingerprintConfig(hardwareSeed: string): FingerprintConfig {
  return {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    language: 'en-US',
    timezone: 'America/Los_Angeles',
    resolution: '1440x900',
    webrtcMode: 'proxy-aware',
    basicSettings: {} as FingerprintConfig['basicSettings'],
    proxySettings: {
      proxyMode: 'direct',
    } as FingerprintConfig['proxySettings'],
    commonSettings: {
      randomizeFingerprintOnLaunch: false,
    } as FingerprintConfig['commonSettings'],
    advanced: {
      browserKernel: 'chrome',
      browserKernelVersion: '145',
      deviceMode: 'desktop',
      operatingSystem: 'macOS',
      operatingSystemVersion: '15.5.0',
      browserVersion: '145',
      autoLanguageFromIp: true,
      autoInterfaceLanguageFromIp: true,
      interfaceLanguage: 'en-US',
      autoTimezoneFromIp: true,
      autoGeolocationFromIp: true,
      geolocationPermission: 'allow',
      geolocation: '',
      windowWidth: 1440,
      windowHeight: 900,
      fontMode: 'system',
      canvasMode: 'custom',
      webglImageMode: 'custom',
      webglMetadataMode: 'custom',
      webglVendor: '',
      webglRenderer: '',
      audioContextMode: 'custom',
      mediaDevicesMode: 'custom',
      speechVoicesMode: 'custom',
      doNotTrackEnabled: false,
      clientRectsMode: 'custom',
      deviceInfoMode: 'custom',
      deviceName: '',
      hostIp: '',
      macAddress: '',
      cpuCores: 8,
      memoryGb: 8,
    } as FingerprintConfig['advanced'],
    runtimeMetadata: {
      hardwareSeed,
      hardwareProfileId: '',
    } as FingerprintConfig['runtimeMetadata'],
  }
}

async function startFixtureServer(): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(
      '<!doctype html><html><head><title>Cloak fingerprint smoke</title></head><body><main id="probe">fingerprint</main></body></html>',
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to resolve local fixture address.')
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

function hashProbe(probe: FingerprintProbe): string {
  return createHash('sha256').update(JSON.stringify(probe)).digest('hex')
}

function near(actual: number, expected: number, tolerance = 0.001): boolean {
  return Math.abs(actual - expected) <= tolerance
}

async function evaluateFingerprint(page: CloakBrowserPageLike): Promise<FingerprintProbe> {
  if (!page.evaluate) {
    throw new Error('Cloak page does not expose evaluate().')
  }
  return page.evaluate(async () => {
    const hashText = (value: string): string => {
      let hash = 2166136261
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index)
        hash = Math.imul(hash, 16777619)
      }
      return (hash >>> 0).toString(16).padStart(8, '0')
    }
    const hashBytes = (value: ArrayLike<number>): string => {
      let hash = 2166136261
      for (let index = 0; index < value.length; index += 1) {
        hash ^= Number(value[index] || 0)
        hash = Math.imul(hash, 16777619)
      }
      return (hash >>> 0).toString(16).padStart(8, '0')
    }

    const canvas = document.createElement('canvas')
    canvas.width = 96
    canvas.height = 48
    const canvasContext = canvas.getContext('2d')
    if (canvasContext) {
      canvasContext.fillStyle = '#f60'
      canvasContext.fillRect(2, 2, 40, 30)
      canvasContext.fillStyle = '#069'
      canvasContext.font = '16px Arial'
      canvasContext.fillText('Duokai Cloak 145', 4, 24)
      canvasContext.globalCompositeOperation = 'multiply'
      canvasContext.fillStyle = 'rgba(102, 204, 0, 0.7)'
      canvasContext.beginPath()
      canvasContext.arc(60, 22, 18, 0, Math.PI * 2)
      canvasContext.fill()
    }

    const canvasPixelHash = canvasContext
      ? hashBytes(canvasContext.getImageData(0, 0, canvas.width, canvas.height).data)
      : ''

    const webglCanvas = document.createElement('canvas')
    const gl =
      (webglCanvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (webglCanvas.getContext('experimental-webgl') as WebGLRenderingContext | null)
    let webglVendor = ''
    let webglRenderer = ''
    if (gl) {
      const extension = gl.getExtension('WEBGL_debug_renderer_info')
      if (extension) {
        webglVendor = String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) || '')
        webglRenderer = String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) || '')
      }
    }

    let audioChecksum: number | null = null
    try {
      const OfflineContext = window.OfflineAudioContext ||
        (window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext })
          .webkitOfflineAudioContext
      if (OfflineContext) {
        const audioContext = new OfflineContext(1, 44100, 44100)
        const oscillator = audioContext.createOscillator()
        const compressor = audioContext.createDynamicsCompressor()
        oscillator.type = 'triangle'
        oscillator.frequency.value = 10_000
        oscillator.connect(compressor)
        compressor.connect(audioContext.destination)
        oscillator.start(0)
        const rendered = await audioContext.startRendering()
        const channel = rendered.getChannelData(0)
        let checksum = 0
        for (let index = 0; index < channel.length; index += 97) {
          checksum += Math.abs(channel[index] || 0)
        }
        audioChecksum = Number(checksum.toFixed(10))
      }
    } catch {
      audioChecksum = null
    }

    const rectNode = document.createElement('div')
    rectNode.style.cssText =
      'position:absolute;left:11.25px;top:17.5px;width:123.75px;height:31.5px;font:13px Arial;'
    rectNode.textContent = 'Cloak rect probe'
    document.body.appendChild(rectNode)
    const rect = rectNode.getBoundingClientRect()
    rectNode.remove()

    const geolocationResult = await new Promise<{
      value: FingerprintProbe['geolocation']
      error: string
    }>((resolve) => {
      if (!navigator.geolocation) {
        resolve({ value: null, error: 'geolocation unavailable' })
        return
      }
      const timer = window.setTimeout(
        () => resolve({ value: null, error: 'geolocation timeout' }),
        5_000,
      )
      navigator.geolocation.getCurrentPosition(
        (position) => {
          window.clearTimeout(timer)
          resolve({
            value: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
            error: '',
          })
        },
        (error) => {
          window.clearTimeout(timer)
          resolve({ value: null, error: `${error.code}:${error.message}` })
        },
        { enableHighAccuracy: false, timeout: 4_000 },
      )
    })

    const nav = navigator as Navigator & {
      deviceMemory?: number
      userAgentData?: {
        brands: Array<{ brand: string; version: string }>
        mobile: boolean
        platform: string
        getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>
      }
    }
    let userAgentData: Record<string, unknown> | null = null
    if (nav.userAgentData) {
      const highEntropy = nav.userAgentData.getHighEntropyValues
        ? await nav.userAgentData.getHighEntropyValues([
            'architecture',
            'bitness',
            'brands',
            'fullVersionList',
            'mobile',
            'model',
            'platform',
            'platformVersion',
            'uaFullVersion',
            'wow64',
          ])
        : {}
      userAgentData = {
        brands: nav.userAgentData.brands,
        mobile: nav.userAgentData.mobile,
        platform: nav.userAgentData.platform,
        ...highEntropy,
      }
    }

    const injectedWindow = window as typeof window & {
      __BITBROWSER_CLONE_INJECTED__?: unknown
    }

    return {
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      language: navigator.language,
      languages: Array.from(navigator.languages),
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: nav.deviceMemory ?? null,
      webdriver: navigator.webdriver ?? null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date('2026-01-15T12:00:00Z').getTimezoneOffset(),
      screen: {
        width: screen.width,
        height: screen.height,
        availWidth: screen.availWidth,
        availHeight: screen.availHeight,
        colorDepth: screen.colorDepth,
        pixelDepth: screen.pixelDepth,
      },
      userAgentData,
      webgl: {
        vendor: webglVendor,
        renderer: webglRenderer,
      },
      canvasHash: hashText(canvas.toDataURL()),
      canvasPixelHash,
      audioChecksum,
      clientRect: {
        x: Number(rect.x.toFixed(6)),
        y: Number(rect.y.toFixed(6)),
        width: Number(rect.width.toFixed(6)),
        height: Number(rect.height.toFixed(6)),
      },
      fonts: {
        Arial: document.fonts.check('16px Arial'),
        TimesNewRoman: document.fonts.check('16px "Times New Roman"'),
        Menlo: document.fonts.check('16px Menlo'),
      },
      geolocation: geolocationResult.value,
      geolocationError: geolocationResult.error,
      legacyInjectionPresent: injectedWindow.__BITBROWSER_CLONE_INJECTED__ !== undefined,
    }
  })
}

async function launchProbe(
  request: CloakRuntimeLaunchRequest,
  url: string,
): Promise<{
  probe: FingerprintProbe
  identity: Record<string, unknown>
}> {
  let context: CloakBrowserContextLike | null = null
  try {
    const launched = await launchCloakPersistentContext(request)
    context = launched.context
    const page = context.pages()[0] ?? (await context.newPage())
    if (!page.goto) {
      throw new Error('Cloak page does not expose goto().')
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    return {
      probe: await evaluateFingerprint(page),
      identity: launched.identity as unknown as Record<string, unknown>,
    }
  } finally {
    await closeCloakContextSafely(context)
  }
}

function buildMapping(hardwareSeed: string): CloakFingerprintMapping {
  return buildCloakFingerprintMapping({
    profileId: `cloak-fingerprint-smoke-${hardwareSeed}`,
    fingerprintConfig: buildFingerprintConfig(hardwareSeed),
    browserVersion: '145.0.7632.109.2',
    resolvedLocale: 'en-US',
    resolvedTimezone: 'America/Los_Angeles',
    resolvedGeolocation: {
      latitude: 34.0522,
      longitude: -118.2437,
      accuracy: 20,
    },
  })
}

async function run(): Promise<FingerprintSmokeReport> {
  const startedAt = new Date().toISOString()
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-fingerprint-'))
  const sameProfileDir = path.join(root, 'same-seed-profile')
  const differentProfileDir = path.join(root, 'different-seed-profile')
  const downloadsDir = path.join(root, 'downloads')
  const cacheDir = process.env.DUOKAI_CLOAK_POC_CACHE_DIR || path.join(root, 'cloak-cache')
  for (const directory of [sameProfileDir, differentProfileDir, downloadsDir, cacheDir]) {
    mkdirSync(directory, { recursive: true })
  }

  const mapping = buildMapping('stable-hardware-alpha')
  const repeatedMapping = buildMapping('stable-hardware-alpha')
  const differentMapping = buildMapping('stable-hardware-beta')
  const baseRequest: CloakRuntimeLaunchRequest = {
    userDataDir: sameProfileDir,
    downloadsDir,
    cacheDir,
    locale: 'placeholder',
    timezoneId: 'UTC',
    fingerprintSeed: 1,
    browserVersion: '145.0.7632.109.2',
    viewport: null,
    deviceMode: 'desktop',
    permissions: [],
  }
  const sameRequest = applyCloakFingerprintMappingToLaunchRequest(baseRequest, mapping)
  const differentRequest = applyCloakFingerprintMappingToLaunchRequest(
    { ...baseRequest, userDataDir: differentProfileDir },
    differentMapping,
  )

  const report: FingerprintSmokeReport = {
    success: false,
    startedAt,
    finishedAt: '',
    browserVersion: baseRequest.browserVersion,
    mapping: {
      fingerprintSeed: mapping.fingerprintSeed,
      mappingHash: mapping.mappingHash,
      args: mapping.mappedFingerprintArgs,
      warnings: mapping.compatibilityWarnings,
    },
    sameSeedStable: false,
    differentSeedDistinct: false,
    nativeIdentityMatches: false,
    geolocationMatches: false,
    legacyInjectionAbsent: false,
    firstProbe: null,
    secondProbe: null,
    differentSeedProbe: null,
    identity: null,
    retainedRoot: '',
    failures: [],
  }

  let fixture: Awaited<ReturnType<typeof startFixtureServer>> | null = null
  try {
    if (mapping.mappingHash !== repeatedMapping.mappingHash) {
      throw new Error('Mapping is not deterministic before browser launch.')
    }
    fixture = await startFixtureServer()
    const first = await launchProbe(sameRequest, fixture.url)
    const second = await launchProbe(sameRequest, fixture.url)
    const different = await launchProbe(differentRequest, fixture.url)
    report.firstProbe = first.probe
    report.secondProbe = second.probe
    report.differentSeedProbe = different.probe
    report.identity = second.identity

    report.sameSeedStable = hashProbe(first.probe) === hashProbe(second.probe)
    report.differentSeedDistinct =
      first.probe.canvasHash !== different.probe.canvasHash ||
      first.probe.canvasPixelHash !== different.probe.canvasPixelHash ||
      first.probe.audioChecksum !== different.probe.audioChecksum ||
      JSON.stringify(first.probe.clientRect) !== JSON.stringify(different.probe.clientRect) ||
      JSON.stringify(first.probe.webgl) !== JSON.stringify(different.probe.webgl)
    report.legacyInjectionAbsent =
      !first.probe.legacyInjectionPresent &&
      !second.probe.legacyInjectionPresent &&
      !different.probe.legacyInjectionPresent
    report.nativeIdentityMatches =
      /Chrome\/145\./.test(second.probe.userAgent) &&
      second.probe.platform === 'MacIntel' &&
      second.probe.language === 'en-US' &&
      second.probe.languages[0] === 'en-US' &&
      second.probe.hardwareConcurrency === 8 &&
      second.probe.deviceMemory === 8 &&
      second.probe.timezone === 'America/Los_Angeles' &&
      second.probe.screen.width === 1440 &&
      second.probe.screen.height === 900 &&
      second.probe.webdriver === false &&
      second.probe.webgl.vendor.length > 0 &&
      second.probe.webgl.renderer.length > 0 &&
      !/direct3d|d3d11|d3d12/i.test(
        `${second.probe.webgl.vendor} ${second.probe.webgl.renderer}`,
      )
    report.geolocationMatches = Boolean(
      second.probe.geolocation &&
        near(second.probe.geolocation.latitude, 34.0522) &&
        near(second.probe.geolocation.longitude, -118.2437),
    )
    report.success =
      report.sameSeedStable &&
      report.differentSeedDistinct &&
      report.nativeIdentityMatches &&
      report.geolocationMatches &&
      report.legacyInjectionAbsent
  } catch (error) {
    report.failures.push({
      stage: report.firstProbe ? 'fingerprint_verification' : 'launch',
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (fixture) {
      await fixture.close()
    }
    if (process.env.DUOKAI_CLOAK_POC_KEEP_PROFILE === '1') {
      report.retainedRoot = root
    } else {
      rmSync(root, { recursive: true, force: true })
    }
    report.finishedAt = new Date().toISOString()
  }

  return report
}

const report = await run()
console.log(JSON.stringify(report, null, 2))
if (!report.success) {
  process.exitCode = 1
}
