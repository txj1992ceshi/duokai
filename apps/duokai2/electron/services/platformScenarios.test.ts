import assert from 'node:assert/strict'
import test from 'node:test'

import type { FingerprintConfig, ProfileRecord, ProxyRecord } from '../../src/shared/types.ts'
import type { NetworkHealthResult } from './networkCheck.ts'
import {
  applyPlatformTemplate,
  createDefaultFingerprint,
  createProfilePayload,
  syncWorkspaceWithFingerprintConfig,
} from './factories.ts'
import { buildFingerprintInitScript, resolveFingerprintScriptStrategy } from './fingerprint.ts'
import { applyNetworkDerivedFingerprint } from './networkProfileResolver.ts'
import { assessRegistrationRisk, validateProfileReadiness } from './profileValidator.ts'
import { resolveWorkspaceLaunchConfig } from './workspaceRuntime.ts'

function buildProxy(): ProxyRecord {
  return {
    id: 'proxy-e2e',
    name: 'Scenario Proxy',
    type: 'http',
    host: '127.0.0.1',
    port: 7890,
    username: '',
    password: '',
    status: 'online',
    lastCheckedAt: '2026-04-17T00:00:00.000Z',
    createdAt: '2026-04-17T00:00:00.000Z',
    updatedAt: '2026-04-17T00:00:00.000Z',
  }
}

function buildNetworkCheck(options: {
  ip: string
  country: string
  region: string
  city: string
  timezone: string
  languageHint: string
  geolocation: string
}): NetworkHealthResult {
  return {
    ok: true,
    source: 'proxy',
    message: 'ok',
    egressPathType: 'custom',
    diagnostics: [],
    checkedAt: '2026-04-17T00:00:00.000Z',
    ...options,
  }
}

function materializeProfileRecord(
  profileId: string,
  platform: 'linkedin' | 'tiktok',
  overrides: {
    environmentPurpose?: ProfileRecord['environmentPurpose']
  } = {},
): ProfileRecord {
  const { fingerprint, recommendedPurpose } = applyPlatformTemplate(createDefaultFingerprint(), platform)
  const payload = createProfilePayload(
    {
      id: profileId,
      name: `${platform}-scenario`,
      proxyId: null,
      groupName: '',
      tags: [platform, 'scenario'],
      notes: 'Integration-style scenario coverage',
      environmentPurpose: overrides.environmentPurpose ?? recommendedPurpose ?? 'register',
      fingerprintConfig: {
        ...fingerprint,
        proxySettings: {
          ...fingerprint.proxySettings,
          proxyMode: 'custom',
          proxyType: 'http',
          host: '127.0.0.1',
          port: 7890,
        },
      },
    },
    createDefaultFingerprint,
  )

  return {
    ...payload,
    environmentPurpose: payload.environmentPurpose ?? overrides.environmentPurpose ?? recommendedPurpose ?? 'register',
    deviceProfile: payload.deviceProfile!,
    status: 'stopped',
    lastStartedAt: null,
    createdAt: '2026-04-17T00:00:00.000Z',
    updatedAt: '2026-04-17T00:00:00.000Z',
  }
}

test('linkedin register scenario stays coherent from preset through runtime launch and risk checks', () => {
  const proxy = buildProxy()
  const check = buildNetworkCheck({
    ip: '3.216.12.34',
    country: 'United States',
    region: 'Virginia',
    city: 'Ashburn',
    timezone: 'America/New_York',
    languageHint: 'en-US',
    geolocation: '39.0438,-77.4874',
  })

  const profile = applyNetworkDerivedFingerprint(
    materializeProfileRecord('profile-linkedin-scenario', 'linkedin'),
    check,
  )
  const launch = resolveWorkspaceLaunchConfig(profile, false)
  const readiness = validateProfileReadiness(profile, proxy, check)
  const risk = assessRegistrationRisk(profile, readiness, check)
  const strategy = resolveFingerprintScriptStrategy(profile.id, profile.fingerprintConfig)
  const script = buildFingerprintInitScript(profile.id, profile.fingerprintConfig)

  assert.equal(profile.environmentPurpose, 'register')
  assert.equal(profile.fingerprintConfig.advanced.operatingSystem, 'Windows')
  assert.equal(profile.fingerprintConfig.advanced.browserVersion, '146')
  assert.equal(profile.workspace?.resolvedEnvironment.browserLanguage, 'en-US')
  assert.equal(profile.workspace?.resolvedEnvironment.systemLanguage, 'en-US')
  assert.equal(profile.workspace?.resolvedEnvironment.timezone, 'America/New_York')
  assert.equal(launch.locale, 'en-US')
  assert.equal(launch.timezoneId, 'America/New_York')
  assert.equal(launch.launchArgs.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'), true)
  assert.equal(launch.launchArgs.includes('--disable-webrtc'), false)
  assert.equal(readiness.level, 'pass')
  assert.equal(risk.level, 'low')
  assert.equal(strategy.canvas.mode, 'custom')
  assert.equal(strategy.webglImage.mode, 'custom')
  assert.equal(strategy.audio.mode, 'custom')
  assert.equal(strategy.mediaDevices.mode, 'custom')
  assert.equal(strategy.speechVoices.mode, 'custom')
  assert.equal(strategy.speechVoices.voices[0]?.lang, 'en-US')
  assert.equal(strategy.mediaDevices.devices.every((device) => device.label === ''), true)
  assert.match(script, /Chrome\/146\.0\.0\.0/)
})

test('tiktok nurture scenario keeps proxy-aware runtime and language-shaped media surfaces', () => {
  const proxy = buildProxy()
  const check = buildNetworkCheck({
    ip: '13.113.11.22',
    country: 'Japan',
    region: 'Tokyo',
    city: 'Tokyo',
    timezone: 'Asia/Tokyo',
    languageHint: 'ja-JP',
    geolocation: '35.6762,139.6503',
  })

  const profile = applyNetworkDerivedFingerprint(
    materializeProfileRecord('profile-tiktok-scenario', 'tiktok'),
    check,
  )
  const launch = resolveWorkspaceLaunchConfig(profile, false)
  const readiness = validateProfileReadiness(profile, proxy, check)
  const risk = assessRegistrationRisk(profile, readiness, check)
  const strategy = resolveFingerprintScriptStrategy(profile.id, profile.fingerprintConfig)
  const includesCamera = !profile.fingerprintConfig.advanced.deviceName.startsWith('DESKTOP-')

  assert.equal(profile.environmentPurpose, 'nurture')
  assert.equal(profile.fingerprintConfig.advanced.browserVersion, '147')
  assert.equal(profile.workspace?.resolvedEnvironment.browserLanguage, 'ja-JP')
  assert.equal(profile.workspace?.resolvedEnvironment.systemLanguage, 'ja-JP')
  assert.equal(profile.workspace?.resolvedEnvironment.timezone, 'Asia/Tokyo')
  assert.equal(launch.locale, 'ja-JP')
  assert.equal(launch.timezoneId, 'Asia/Tokyo')
  assert.equal(launch.launchArgs.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'), true)
  assert.equal(readiness.level, 'pass')
  assert.equal(risk.score, 0)
  assert.equal(risk.level, 'low')
  assert.equal(strategy.mediaDevices.mode, 'custom')
  assert.equal(strategy.speechVoices.mode, 'custom')
  assert.equal(strategy.speechVoices.voices[0]?.lang, 'ja-JP')
  assert.equal(
    strategy.mediaDevices.devices.some((device) => device.kind === 'videoinput'),
    includesCamera,
  )
})

test('linkedin register scenario surfaces warnings when reverted to legacy noisy defaults', () => {
  const proxy = buildProxy()
  const check = buildNetworkCheck({
    ip: '3.216.12.34',
    country: 'United States',
    region: 'Virginia',
    city: 'Ashburn',
    timezone: 'America/New_York',
    languageHint: 'en-US',
    geolocation: '39.0438,-77.4874',
  })

  const stableProfile = applyNetworkDerivedFingerprint(
    materializeProfileRecord('profile-linkedin-stable-scenario', 'linkedin'),
    check,
  )
  const stableReadiness = validateProfileReadiness(stableProfile, proxy, check)
  const stableRisk = assessRegistrationRisk(stableProfile, stableReadiness, check)

  const noisyFingerprint: FingerprintConfig = {
    ...stableProfile.fingerprintConfig,
    webrtcMode: 'default' as const,
    commonSettings: {
      ...stableProfile.fingerprintConfig.commonSettings,
      syncTabs: true,
    },
    advanced: {
      ...stableProfile.fingerprintConfig.advanced,
      canvasMode: 'random',
      webglImageMode: 'random',
      audioContextMode: 'random',
      clientRectsMode: 'random',
      mediaDevicesMode: 'random',
    },
  }
  const noisyProfile: ProfileRecord = {
    ...stableProfile,
    fingerprintConfig: noisyFingerprint,
    workspace: syncWorkspaceWithFingerprintConfig(stableProfile.workspace, noisyFingerprint),
  }

  const launch = resolveWorkspaceLaunchConfig(noisyProfile, false)
  const readiness = validateProfileReadiness(noisyProfile, proxy, check)
  const risk = assessRegistrationRisk(noisyProfile, readiness, check)

  assert.equal(launch.launchArgs.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'), false)
  assert.equal(launch.launchArgs.includes('--disable-webrtc'), false)
  assert.equal(readiness.level, 'warn')
  assert.match(readiness.messages.join(' '), /代理感知 WebRTC/)
  assert.match(readiness.messages.join(' '), /高噪声随机扰动/)
  assert.match(readiness.messages.join(' '), /标签页同步/)
  assert.ok(risk.score > stableRisk.score)
  assert.equal(risk.level === 'medium' || risk.level === 'high', true)
})
