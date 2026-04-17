import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultFingerprint } from './factories.ts'
import { createDeviceProfileFromFingerprint } from './deviceProfile.ts'

test('createDeviceProfileFromFingerprint marks implemented custom fingerprint surfaces as active', () => {
  const fingerprint = createDefaultFingerprint()
  const profile = createDeviceProfileFromFingerprint(fingerprint)

  assert.equal(profile.support.fonts, 'active')
  assert.equal(profile.support.mediaDevices, 'active')
  assert.equal(profile.support.speechVoices, 'active')
  assert.equal(profile.support.canvas, 'active')
  assert.equal(profile.support.webgl, 'active')
  assert.equal(profile.support.audio, 'active')
  assert.equal(profile.support.deviceInfo, 'active')
  assert.equal(profile.support.clientRects, 'partial')
})
