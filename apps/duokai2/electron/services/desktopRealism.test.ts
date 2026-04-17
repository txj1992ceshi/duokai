import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultFingerprint } from './factories.ts'
import {
  resolveDeviceInfoBaseline,
  resolveFontBaseline,
} from './desktopRealism.ts'

test('resolveFontBaseline returns windows desktop font baselines for windows templates', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.operatingSystem = 'Windows'
  fingerprint.runtimeMetadata.hardwareTemplateId = 'win_business_latitude_5440'

  const baseline = resolveFontBaseline(fingerprint)

  assert.equal(baseline.operatingSystem, 'Windows')
  assert.equal(baseline.templateFamily, 'win_business')
  assert.equal(baseline.supportedFamilies.includes('Segoe UI'), true)
  assert.equal(baseline.supportedFamilies.includes('SF Pro Text'), false)
})

test('resolveFontBaseline returns mac desktop font baselines for mac templates', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.operatingSystem = 'macOS'
  fingerprint.runtimeMetadata.hardwareTemplateId = 'mac_air_m3_13'

  const baseline = resolveFontBaseline(fingerprint)

  assert.equal(baseline.operatingSystem, 'macOS')
  assert.equal(baseline.templateFamily, 'mac_air')
  assert.equal(baseline.supportedFamilies.includes('SF Pro Text'), true)
  assert.equal(baseline.supportedFamilies.includes('Segoe UI'), false)
})

test('resolveDeviceInfoBaseline aligns UA-CH with windows desktop bundles', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.operatingSystem = 'Windows'
  fingerprint.advanced.browserVersion = '147'
  fingerprint.runtimeMetadata.hardwareTemplateId = 'win_home_inspiron_14_5430'

  const baseline = resolveDeviceInfoBaseline(fingerprint)

  assert.equal(baseline.templateFamily, 'win_home')
  assert.equal(baseline.platform, 'Windows')
  assert.equal(baseline.architecture, 'x86')
  assert.equal(baseline.maxTouchPoints, 0)
  assert.equal(baseline.pdfViewerEnabled, true)
  assert.equal(baseline.brands.some((item) => item.brand === 'Google Chrome' && item.version === '147'), true)
})

test('resolveDeviceInfoBaseline aligns UA-CH with mac desktop bundles', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.operatingSystem = 'macOS'
  fingerprint.advanced.browserVersion = '146'
  fingerprint.runtimeMetadata.hardwareTemplateId = 'mac_pro_14_m3_pro'

  const baseline = resolveDeviceInfoBaseline(fingerprint)

  assert.equal(baseline.templateFamily, 'mac_pro')
  assert.equal(baseline.platform, 'macOS')
  assert.equal(baseline.architecture, 'arm')
  assert.equal(baseline.uaFullVersion, '146.0.0.0')
  assert.deepEqual(baseline.formFactors, ['Desktop'])
})
