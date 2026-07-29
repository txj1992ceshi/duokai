import assert from 'node:assert/strict'
import test from 'node:test'

import type { FingerprintConfig } from '../../src/shared/types.ts'
import {
  applyCloakFingerprintMappingToLaunchRequest,
  buildCloakFingerprintMapping,
  CloakFingerprintMappingError,
} from './cloakBrowserFingerprint.ts'
import type { CloakRuntimeLaunchRequest } from './cloakBrowserRuntime.ts'

const CLOAK_VERSION = '145.0.7632.109.2'

function buildFingerprintConfig(): FingerprintConfig {
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
      webglVendor: 'Apple Inc.',
      webglRenderer: 'Apple M3',
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
      hardwareSeed: 'hardware-seed-alpha',
      hardwareProfileId: '',
    } as FingerprintConfig['runtimeMetadata'],
  }
}

function buildInput() {
  const fingerprintConfig = buildFingerprintConfig()
  return {
    profileId: 'profile-alpha',
    fingerprintConfig,
    browserVersion: CLOAK_VERSION,
    resolvedLocale: 'en-US',
    resolvedTimezone: 'America/Los_Angeles',
    resolvedGeolocation: { latitude: 34.0522, longitude: -118.2437 },
  }
}

test('buildCloakFingerprintMapping is deterministic for stable identity', () => {
  const first = buildCloakFingerprintMapping(buildInput())
  const second = buildCloakFingerprintMapping(buildInput())

  assert.equal(first.fingerprintSeed, second.fingerprintSeed)
  assert.equal(first.mappingHash, second.mappingHash)
  assert.equal(first.seedSource, 'hardwareSeed')
  assert.equal(first.fingerprintSeed > 99_999, true)
  assert.equal(first.fingerprintSeed <= 0x7fffffff, true)
  assert.equal(first.platform, 'macos')
  assert.equal(first.chromiumMajor, '145')
  assert.equal(first.clientHintsPolicy.metadata.platform, 'macOS')
  assert.equal(first.clientHintsPolicy.metadata.architecture, 'arm')
  assert.equal(first.clientHintsPolicy.enforcement, 'cdp-native-override')
  assert.equal(first.legacyInitScriptPolicy, 'forbidden')
  assert.equal(first.mappedFingerprintArgs.includes('--fingerprint-platform=macos'), true)
  assert.equal(first.mappedFingerprintArgs.includes('--fingerprint-brand=Chrome'), true)
  assert.equal(
    first.mappedFingerprintArgs.includes('--fingerprint-brand-version=145.0.7632.109'),
    true,
  )
  assert.equal(first.mappedFingerprintArgs.includes('--fingerprint-screen-width=1440'), true)
  assert.equal(first.mappedFingerprintArgs.includes('--fingerprint-screen-height=900'), true)
  assert.equal(
    first.mappedFingerprintArgs.some((argument) => argument.startsWith('--fingerprint-gpu-')),
    false,
  )
  assert.equal(
    first.compatibilityWarnings.some((message) => message.includes('profile uniqueness')),
    true,
  )
  assert.equal(first.permissions.includes('geolocation'), true)
})

test('Windows mappings enforce coherent x86 UA Client Hints', () => {
  const input = buildInput()
  input.fingerprintConfig.userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
  input.fingerprintConfig.advanced.operatingSystem = 'Windows'
  input.fingerprintConfig.advanced.operatingSystemVersion = '19.0.0'
  input.fingerprintConfig.runtimeMetadata.hardwareTemplateId = 'win_home_inspiron_14_5430'

  const mapping = buildCloakFingerprintMapping(input)

  assert.equal(mapping.platform, 'windows')
  assert.equal(mapping.clientHintsPolicy.navigatorPlatform, 'Win32')
  assert.equal(mapping.clientHintsPolicy.metadata.platform, 'Windows')
  assert.equal(mapping.clientHintsPolicy.metadata.architecture, 'x86')
  assert.equal(mapping.clientHintsPolicy.metadata.bitness, '64')
  assert.equal(mapping.clientHintsPolicy.metadata.platformVersion, '19.0.0')
})

test('hardware seed changes produce different stable fingerprints', () => {
  const first = buildInput()
  const second = buildInput()
  second.fingerprintConfig.runtimeMetadata.hardwareSeed = 'hardware-seed-beta'

  const firstMapping = buildCloakFingerprintMapping(first)
  const secondMapping = buildCloakFingerprintMapping(second)

  assert.notEqual(firstMapping.fingerprintSeed, secondMapping.fingerprintSeed)
  assert.notEqual(firstMapping.mappingHash, secondMapping.mappingHash)
})

test('browser identity mismatch is blocked', () => {
  const input = buildInput()
  input.fingerprintConfig.advanced.browserVersion = '147'

  assert.throws(
    () => buildCloakFingerprintMapping(input),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError &&
      error.code === 'browser_version_mismatch',
  )
})

test('User-Agent platform mismatch is blocked', () => {
  const input = buildInput()
  input.fingerprintConfig.userAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'

  assert.throws(
    () => buildCloakFingerprintMapping(input),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError && error.code === 'invalid_profile',
  )
})

test('randomize-on-launch and random legacy modes are blocked', () => {
  const randomizedLaunch = buildInput()
  randomizedLaunch.fingerprintConfig.commonSettings.randomizeFingerprintOnLaunch = true
  assert.throws(
    () => buildCloakFingerprintMapping(randomizedLaunch),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError &&
      error.code === 'unstable_fingerprint',
  )

  const randomCanvas = buildInput()
  randomCanvas.fingerprintConfig.advanced.canvasMode = 'random'
  assert.throws(
    () => buildCloakFingerprintMapping(randomCanvas),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError &&
      error.code === 'unstable_fingerprint',
  )
})

test('partial native noise disabling is blocked', () => {
  const input = buildInput()
  input.fingerprintConfig.advanced.canvasMode = 'off'
  input.fingerprintConfig.advanced.webglImageMode = 'custom'
  input.fingerprintConfig.advanced.audioContextMode = 'custom'
  input.fingerprintConfig.advanced.clientRectsMode = 'custom'

  assert.throws(
    () => buildCloakFingerprintMapping(input),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError &&
      error.code === 'partial_noise_policy_unsupported',
  )
})

test('global native noise disabling maps to one Cloak flag', () => {
  const input = buildInput()
  input.fingerprintConfig.advanced.canvasMode = 'off'
  input.fingerprintConfig.advanced.webglImageMode = 'off'
  input.fingerprintConfig.advanced.audioContextMode = 'off'
  input.fingerprintConfig.advanced.clientRectsMode = 'off'

  const mapping = buildCloakFingerprintMapping(input)
  assert.equal(mapping.mappedFingerprintArgs.includes('--fingerprint-noise=false'), true)
})

test('proxy-aware mapping requires a verified egress IP', () => {
  const input = buildInput()
  input.fingerprintConfig.proxySettings.proxyMode = 'custom'
  input.fingerprintConfig.webrtcMode = 'proxy-aware'

  assert.throws(
    () => buildCloakFingerprintMapping(input),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError &&
      error.code === 'missing_verified_webrtc_ip',
  )

  const mapping = buildCloakFingerprintMapping({
    ...input,
    verifiedWebRtcIp: '203.0.113.25',
  })
  assert.equal(
    mapping.mappedFingerprintArgs.includes('--fingerprint-webrtc-ip=203.0.113.25'),
    true,
  )
  assert.equal(
    mapping.mappedFingerprintArgs.includes(
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ),
    true,
  )
})

test('incoherent WebGL overrides are ignored with a warning', () => {
  const input = buildInput()
  input.fingerprintConfig.advanced.webglVendor = 'Google Inc. (NVIDIA)'
  input.fingerprintConfig.advanced.webglRenderer =
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Ti Direct3D11)'

  const mapping = buildCloakFingerprintMapping(input)
  assert.equal(
    mapping.mappedFingerprintArgs.some((arg) => arg.startsWith('--fingerprint-gpu-')),
    false,
  )
  assert.equal(
    mapping.compatibilityWarnings.some((message) => message.includes('WebGL')),
    true,
  )
})

test('device memory is normalized to Chromium exposure buckets', () => {
  const input = buildInput()
  input.fingerprintConfig.advanced.memoryGb = 16

  const mapping = buildCloakFingerprintMapping(input)
  assert.equal(mapping.mappedFingerprintArgs.includes('--fingerprint-device-memory=8'), true)
  assert.equal(
    mapping.compatibilityWarnings.some((message) => message.includes('memoryGb=16')),
    true,
  )
})

test('invalid resolved locale, timezone and geolocation are blocked', () => {
  assert.throws(
    () => buildCloakFingerprintMapping({ ...buildInput(), resolvedLocale: 'bad_locale' }),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError && error.code === 'invalid_profile',
  )
  assert.throws(
    () => buildCloakFingerprintMapping({ ...buildInput(), resolvedTimezone: 'Mars/Olympus' }),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError && error.code === 'invalid_profile',
  )
  assert.throws(
    () =>
      buildCloakFingerprintMapping({
        ...buildInput(),
        resolvedGeolocation: { latitude: 100, longitude: 0 },
      }),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError && error.code === 'invalid_profile',
  )
})

test('automatic environment fields require resolved values', () => {
  const input = buildInput()

  assert.throws(
    () => buildCloakFingerprintMapping({ ...input, resolvedLocale: undefined }),
    (error: unknown) =>
      error instanceof CloakFingerprintMappingError &&
      error.code === 'missing_resolved_environment',
  )
})

test('applyCloakFingerprintMappingToLaunchRequest transfers only native mapping fields', () => {
  const mapping = buildCloakFingerprintMapping(buildInput())
  const request: CloakRuntimeLaunchRequest = {
    userDataDir: '/tmp/profile',
    downloadsDir: '/tmp/downloads',
    cacheDir: '/tmp/cache',
    locale: 'old-locale',
    timezoneId: 'old-timezone',
    fingerprintSeed: 1,
    browserVersion: CLOAK_VERSION,
    viewport: null,
    deviceMode: 'desktop',
    geolocation: { latitude: 0, longitude: 0 },
    permissions: [],
  }

  const mapped = applyCloakFingerprintMappingToLaunchRequest(request, mapping)
  assert.equal(mapped.locale, 'en-US')
  assert.equal(mapped.timezoneId, 'America/Los_Angeles')
  assert.equal(mapped.fingerprintSeed, mapping.fingerprintSeed)
  assert.deepEqual(mapped.clientHintsPolicy, mapping.clientHintsPolicy)
  assert.deepEqual(mapped.mappedFingerprintArgs, mapping.mappedFingerprintArgs)
  assert.deepEqual(mapped.permissions, ['geolocation'])
  assert.deepEqual(mapped.geolocation, {
    latitude: 34.0522,
    longitude: -118.2437,
  })
})
