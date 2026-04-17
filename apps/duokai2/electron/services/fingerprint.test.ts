import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultFingerprint } from './factories.ts'
import {
  buildFingerprintInitScript,
  resolveFingerprintScriptStrategy,
} from './fingerprint.ts'

test('resolveFingerprintScriptStrategy uses stable low-noise defaults for desktop profiles', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.deviceName = 'LAPTOP-ABCD123'
  fingerprint.language = 'ja-JP'
  fingerprint.advanced.interfaceLanguage = 'ja-JP'

  const strategy = resolveFingerprintScriptStrategy('profile-strategy-default', fingerprint)

  assert.equal(strategy.canvas.mode, 'custom')
  assert.equal(strategy.webglImage.mode, 'custom')
  assert.equal(strategy.audio.mode, 'custom')
  assert.equal(strategy.clientRects.mode, 'off')
  assert.equal(strategy.fonts.enabled, true)
  assert.equal(strategy.mediaDevices.mode, 'custom')
  assert.equal(strategy.speechVoices.mode, 'custom')
  assert.equal(strategy.deviceInfo.enabled, true)
  assert.equal(strategy.mediaDevices.devices.some((device) => device.kind === 'videoinput'), true)
  assert.equal(strategy.speechVoices.voices[0]?.lang, 'ja-JP')
})

test('resolveFingerprintScriptStrategy shapes media devices from desktop device names', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.deviceName = 'DESKTOP-ABCD123'

  const strategy = resolveFingerprintScriptStrategy('profile-strategy-desktop', fingerprint)

  assert.equal(strategy.mediaDevices.devices.some((device) => device.kind === 'videoinput'), false)
  assert.equal(strategy.mediaDevices.devices.every((device) => device.label === ''), true)
})

test('resolveFingerprintScriptStrategy exposes desktop font and userAgentData baselines', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.operatingSystem = 'Windows'
  fingerprint.runtimeMetadata.hardwareTemplateId = 'win_business_latitude_5440'

  const strategy = resolveFingerprintScriptStrategy('profile-strategy-device-info', fingerprint)

  assert.equal(strategy.fonts.supportedFamilies.includes('Segoe UI'), true)
  assert.equal(strategy.deviceInfo.platform, 'Windows')
  assert.equal(strategy.deviceInfo.brands.some((item) => item.brand === 'Google Chrome'), true)
})

test('buildFingerprintInitScript separates custom and random branches in the injected script', () => {
  const customFingerprint = createDefaultFingerprint()
  customFingerprint.advanced.canvasMode = 'custom'
  customFingerprint.advanced.webglImageMode = 'custom'
  customFingerprint.advanced.audioContextMode = 'custom'

  const randomFingerprint = createDefaultFingerprint()
  randomFingerprint.advanced.canvasMode = 'random'
  randomFingerprint.advanced.webglImageMode = 'random'
  randomFingerprint.advanced.audioContextMode = 'random'
  randomFingerprint.advanced.clientRectsMode = 'random'

  const customScript = buildFingerprintInitScript('profile-script-custom', customFingerprint)
  const randomScript = buildFingerprintInitScript('profile-script-random', randomFingerprint)

  assert.match(customScript, /"intensity":"stable"/)
  assert.match(randomScript, /"intensity":"legacy"/)
  assert.match(customScript, /HTMLCanvasElement\.prototype\.toDataURL/)
  assert.match(randomScript, /target\.readPixels = function/)
})

test('buildFingerprintInitScript skips disabled feature patches', () => {
  const fingerprint = createDefaultFingerprint()
  fingerprint.advanced.canvasMode = 'off'
  fingerprint.advanced.webglImageMode = 'off'
  fingerprint.advanced.webglMetadataMode = 'off'
  fingerprint.advanced.audioContextMode = 'off'
  fingerprint.advanced.clientRectsMode = 'off'
  fingerprint.advanced.mediaDevicesMode = 'off'
  fingerprint.advanced.speechVoicesMode = 'off'

  const script = buildFingerprintInitScript('profile-script-off', fingerprint)

  assert.match(script, /"canvas":\{"mode":"off","enabled":false/)
  assert.match(script, /"webglImage":\{"mode":"off","enabled":false/)
  assert.match(script, /"webglMetadata":\{"mode":"off","enabled":false/)
  assert.match(script, /"audio":\{"mode":"off","enabled":false/)
  assert.match(script, /"clientRects":\{"mode":"off","enabled":false/)
  assert.match(script, /"mediaDevices":\{"mode":"off","enabled":false,"intensity":"none","devices":\[\]\}/)
  assert.match(script, /"speechVoices":\{"mode":"off","enabled":false,"intensity":"none","voices":\[\]\}/)
  assert.match(script, /"deviceInfo":\{"mode":"custom","enabled":true/)
})
