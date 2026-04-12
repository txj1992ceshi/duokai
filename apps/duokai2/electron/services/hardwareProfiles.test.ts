import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultFingerprint } from './factories.ts'
import {
  HARDWARE_CATALOG_VERSION,
  assignStableHardwareFingerprint,
  sanitizeTemplateHardwareFingerprint,
  shouldMigrateStableHardwareFingerprint,
  STABLE_HARDWARE_PROFILE_VERSION,
} from '../../src/shared/hardwareProfiles.ts'

test('assignStableHardwareFingerprint is stable for the same profile id', () => {
  const first = assignStableHardwareFingerprint(createDefaultFingerprint(), 'profile-stable')
  const second = assignStableHardwareFingerprint(createDefaultFingerprint(), 'profile-stable')

  assert.equal(first.advanced.deviceName, second.advanced.deviceName)
  assert.equal(first.advanced.macAddress, second.advanced.macAddress)
  assert.equal(first.advanced.webglRenderer, second.advanced.webglRenderer)
  assert.equal(first.runtimeMetadata.hardwareProfileVersion, STABLE_HARDWARE_PROFILE_VERSION)
  assert.equal(first.runtimeMetadata.hardwareProfileSource, 'generated')
  assert.equal(first.runtimeMetadata.hardwareCatalogVersion, HARDWARE_CATALOG_VERSION)
  assert.equal(first.runtimeMetadata.hardwareTemplateId, second.runtimeMetadata.hardwareTemplateId)
  assert.equal(first.runtimeMetadata.hardwareVariantId, second.runtimeMetadata.hardwareVariantId)
})

test('assignStableHardwareFingerprint differs across profile ids', () => {
  const first = assignStableHardwareFingerprint(createDefaultFingerprint(), 'profile-a')
  const second = assignStableHardwareFingerprint(createDefaultFingerprint(), 'profile-b')

  assert.notEqual(first.advanced.deviceName, second.advanced.deviceName)
  assert.notEqual(first.advanced.macAddress, second.advanced.macAddress)
})

test('macOS hardware profiles keep macOS-compatible renderers', () => {
  const macFingerprint = createDefaultFingerprint()
  const generated = assignStableHardwareFingerprint(macFingerprint, 'profile-mac')

  assert.equal(generated.advanced.operatingSystem, 'macOS')
  assert.match(generated.advanced.webglRenderer, /Apple|Metal/i)
  assert.doesNotMatch(generated.advanced.webglRenderer, /Direct3D/i)
})

test('macOS hardware profiles use realistic cpu and memory pairings', () => {
  const macFingerprint = createDefaultFingerprint()
  const generated = assignStableHardwareFingerprint(macFingerprint, 'profile-mac-realistic')
  const pairing = `${generated.advanced.cpuCores}/${generated.advanced.memoryGb}`
  const supportedPairings = new Set(['8/8', '8/16', '8/24', '11/18', '11/36', '12/18', '12/36'])

  assert.equal(generated.advanced.operatingSystem, 'macOS')
  assert.equal(supportedPairings.has(pairing), true)
})

test('macOS Air templates never emit Pro-only resolutions', () => {
  const macFingerprint = createDefaultFingerprint()
  const generated = assignStableHardwareFingerprint(macFingerprint, 'profile-mac-air-resolution', {
    forceRegenerate: true,
    seed: 'mac-air-template-seed',
  })

  if (generated.runtimeMetadata.hardwareTemplateId.startsWith('mac_air_')) {
    assert.equal(['1512x982', '1728x1117'].includes(generated.resolution), false)
  }
})

test('Windows business templates stay on business-class GPU renderers', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.operatingSystem = 'Windows'

  const generated = assignStableHardwareFingerprint(fingerprint, 'profile-win-business-seed', {
    forceRegenerate: true,
    seed: 'win-business-template-seed',
  })

  if (generated.runtimeMetadata.hardwareTemplateId.startsWith('win_business_')) {
    assert.match(generated.advanced.webglRenderer, /UHD|Iris\(R\) Xe|Iris Xe/i)
    assert.doesNotMatch(generated.advanced.webglRenderer, /RTX|GTX|Radeon/i)
  }
})

test('generated profiles record template metadata', () => {
  const generated = assignStableHardwareFingerprint(createDefaultFingerprint(), 'profile-metadata')

  assert.ok(generated.runtimeMetadata.hardwareTemplateId.length > 0)
  assert.ok(generated.runtimeMetadata.hardwareVariantId.length > 0)
  assert.equal(generated.runtimeMetadata.hardwareCatalogVersion, HARDWARE_CATALOG_VERSION)
})

test('manual hardware identity is preserved and marked as manual', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.deviceName = 'DESKTOP-CUSTOM99'
  fingerprint.advanced.hostIp = '10.0.9.99'
  fingerprint.advanced.macAddress = '02-AA-BB-CC-DD-EE'
  fingerprint.advanced.webglVendor = 'Google Inc. (Intel)'
  fingerprint.advanced.webglRenderer = 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'

  const preserved = assignStableHardwareFingerprint(fingerprint, 'profile-manual')
  assert.equal(preserved.advanced.deviceName, 'DESKTOP-CUSTOM99')
  assert.equal(preserved.runtimeMetadata.hardwareProfileSource, 'manual')
  assert.equal(preserved.runtimeMetadata.hardwareTemplateId, '')
})

test('sanitizeTemplateHardwareFingerprint marks template source without fixing hardware identity', () => {
  const fingerprint = assignStableHardwareFingerprint(createDefaultFingerprint(), 'profile-template')
  const sanitized = sanitizeTemplateHardwareFingerprint(fingerprint)

  assert.equal(sanitized.runtimeMetadata.hardwareProfileSource, 'template')
  assert.equal(sanitized.runtimeMetadata.hardwareProfileId, '')
  assert.equal(sanitized.runtimeMetadata.hardwareSeed, '')
  assert.equal(sanitized.runtimeMetadata.hardwareTemplateId, '')
  assert.equal(sanitized.runtimeMetadata.hardwareVariantId, '')
})

test('legacy defaults are marked for migration', () => {
  const fingerprint = createDefaultFingerprint()
  assert.equal(shouldMigrateStableHardwareFingerprint(fingerprint), true)
})
