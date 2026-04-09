import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultFingerprint } from './factories.ts'
import {
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
})

test('sanitizeTemplateHardwareFingerprint marks template source without fixing hardware identity', () => {
  const fingerprint = assignStableHardwareFingerprint(createDefaultFingerprint(), 'profile-template')
  const sanitized = sanitizeTemplateHardwareFingerprint(fingerprint)

  assert.equal(sanitized.runtimeMetadata.hardwareProfileSource, 'template')
  assert.equal(sanitized.runtimeMetadata.hardwareProfileId, '')
  assert.equal(sanitized.runtimeMetadata.hardwareSeed, '')
})

test('legacy defaults are marked for migration', () => {
  const fingerprint = createDefaultFingerprint()
  assert.equal(shouldMigrateStableHardwareFingerprint(fingerprint), true)
})
