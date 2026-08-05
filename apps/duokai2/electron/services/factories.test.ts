import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyPlatformTemplate,
  createDefaultFingerprint,
  normalizeFingerprintConfig,
} from './factories.ts'
import {
  emptyProfile,
  normalizeFingerprintForSave,
} from '../../src/lib/desktop-profile-presets.ts'

test('createDefaultFingerprint uses current browser baseline and auto locale defaults', () => {
  const fingerprint = createDefaultFingerprint()

  assert.equal(fingerprint.advanced.browserVersion, '145')
  assert.equal(fingerprint.advanced.browserKernelVersion, '145')
  assert.equal(fingerprint.advanced.autoInterfaceLanguageFromIp, true)
  assert.equal(fingerprint.advanced.geolocationPermission, 'allow')
  assert.equal(fingerprint.webrtcMode, 'proxy-aware')
  assert.equal(fingerprint.advanced.canvasMode, 'custom')
  assert.equal(fingerprint.advanced.webglImageMode, 'custom')
  assert.equal(fingerprint.advanced.audioContextMode, 'custom')
  assert.equal(fingerprint.advanced.mediaDevicesMode, 'custom')
  assert.equal(fingerprint.advanced.speechVoicesMode, 'custom')
  assert.equal(fingerprint.advanced.clientRectsMode, 'off')
  assert.match(fingerprint.userAgent, /Chrome\/145\.0\.0\.0/)
})

test('emptyProfile uses current browser baseline and auto locale defaults', () => {
  const profile = emptyProfile()

  assert.equal(profile.fingerprintConfig.advanced.browserVersion, '145')
  assert.equal(profile.fingerprintConfig.advanced.browserKernelVersion, '145')
  assert.equal(profile.fingerprintConfig.advanced.autoInterfaceLanguageFromIp, true)
  assert.equal(profile.fingerprintConfig.advanced.geolocationPermission, 'allow')
  assert.equal(profile.fingerprintConfig.webrtcMode, 'proxy-aware')
  assert.equal(profile.fingerprintConfig.advanced.canvasMode, 'custom')
  assert.equal(profile.fingerprintConfig.advanced.webglImageMode, 'custom')
  assert.equal(profile.fingerprintConfig.advanced.audioContextMode, 'custom')
  assert.equal(profile.fingerprintConfig.advanced.mediaDevicesMode, 'custom')
  assert.equal(profile.fingerprintConfig.advanced.speechVoicesMode, 'custom')
  assert.equal(profile.fingerprintConfig.advanced.clientRectsMode, 'off')
  assert.match(profile.fingerprintConfig.userAgent, /Chrome\/145\.0\.0\.0/)
})

test('applyPlatformTemplate keeps linkedin machine identity and enables region linkage', () => {
  const source = createDefaultFingerprint()
  source.advanced.operatingSystem = 'macOS'
  source.advanced.browserVersion = '145'
  source.advanced.browserKernelVersion = '145'
  source.advanced.cpuCores = 11
  source.advanced.memoryGb = 18
  source.advanced.webglRenderer = 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)'
  source.resolution = '1728x1117'
  const { fingerprint } = applyPlatformTemplate(source, 'linkedin')

  assert.equal(fingerprint.advanced.operatingSystem, source.advanced.operatingSystem)
  assert.equal(fingerprint.advanced.browserVersion, source.advanced.browserVersion)
  assert.equal(fingerprint.advanced.browserKernelVersion, source.advanced.browserKernelVersion)
  assert.equal(fingerprint.advanced.cpuCores, source.advanced.cpuCores)
  assert.equal(fingerprint.advanced.memoryGb, source.advanced.memoryGb)
  assert.equal(fingerprint.advanced.webglRenderer, source.advanced.webglRenderer)
  assert.equal(fingerprint.resolution, source.resolution)
  assert.equal(fingerprint.advanced.autoLanguageFromIp, true)
  assert.equal(fingerprint.advanced.autoInterfaceLanguageFromIp, true)
  assert.equal(fingerprint.advanced.autoTimezoneFromIp, true)
  assert.equal(fingerprint.advanced.autoGeolocationFromIp, true)
  assert.equal(fingerprint.webrtcMode, 'proxy-aware')
  assert.equal(fingerprint.commonSettings.syncTabs, false)
})

test('applyPlatformTemplate keeps tiktok machine identity and enables region linkage', () => {
  const source = createDefaultFingerprint()
  source.advanced.operatingSystem = 'Windows'
  source.advanced.browserVersion = '145'
  source.advanced.browserKernelVersion = '145'
  source.advanced.cpuCores = 6
  source.advanced.memoryGb = 16
  source.advanced.webglRenderer = 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11, D3D11)'
  source.resolution = '1920x1200'
  const { fingerprint } = applyPlatformTemplate(source, 'tiktok')

  assert.equal(fingerprint.advanced.operatingSystem, source.advanced.operatingSystem)
  assert.equal(fingerprint.advanced.browserVersion, source.advanced.browserVersion)
  assert.equal(fingerprint.advanced.browserKernelVersion, source.advanced.browserKernelVersion)
  assert.equal(fingerprint.advanced.cpuCores, source.advanced.cpuCores)
  assert.equal(fingerprint.advanced.memoryGb, source.advanced.memoryGb)
  assert.equal(fingerprint.advanced.webglRenderer, source.advanced.webglRenderer)
  assert.equal(fingerprint.resolution, source.resolution)
  assert.equal(fingerprint.advanced.autoInterfaceLanguageFromIp, true)
  assert.equal(fingerprint.advanced.autoTimezoneFromIp, true)
  assert.equal(fingerprint.advanced.autoGeolocationFromIp, true)
  assert.equal(fingerprint.webrtcMode, 'proxy-aware')
  assert.equal(fingerprint.commonSettings.syncTabs, true)
})

test('normalizeFingerprintConfig rewrites user agent and kernel version from browser version', () => {
  const normalized = normalizeFingerprintConfig({
    userAgent: 'Mozilla/5.0 Chrome/99.0.0.0 Safari/537.36',
    advanced: {
      ...createDefaultFingerprint().advanced,
      operatingSystem: 'macOS',
      browserVersion: '146',
      browserKernelVersion: '99',
    },
  })

  assert.equal(normalized.advanced.browserVersion, '146')
  assert.equal(normalized.advanced.browserKernelVersion, '146')
  assert.match(normalized.userAgent, /Chrome\/146\.0\.0\.0/)
  assert.match(normalized.userAgent, /Macintosh/)
})

test('normalizeFingerprintForSave rewrites user agent and kernel version from browser version', () => {
  const normalized = normalizeFingerprintForSave({
    ...createDefaultFingerprint(),
    userAgent: 'Mozilla/5.0 Chrome/88.0.0.0 Safari/537.36',
    advanced: {
      ...createDefaultFingerprint().advanced,
      operatingSystem: 'Windows',
      browserVersion: '147',
      browserKernelVersion: '88',
    },
  })

  assert.equal(normalized.advanced.browserVersion, '147')
  assert.equal(normalized.advanced.browserKernelVersion, '147')
  assert.match(normalized.userAgent, /Chrome\/147\.0\.0\.0/)
  assert.match(normalized.userAgent, /Windows NT 10\.0/)
})
