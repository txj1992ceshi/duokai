import assert from 'node:assert/strict'
import test from 'node:test'

import type { ProxyRecord } from '../../src/shared/types.ts'
import {
  buildPlatformSmokeArtifactBaseName,
  buildPlatformSmokeProfileInput,
  evaluatePlatformSmokeSuccess,
  resolvePlatformSmokeScenario,
} from './platformSmoke.ts'

function buildProxy(): ProxyRecord {
  return {
    id: 'proxy-smoke',
    name: 'Smoke Proxy',
    type: 'http',
    host: '127.0.0.1',
    port: 7890,
    username: '',
    password: '',
    status: 'online',
    lastCheckedAt: null,
    createdAt: '2026-04-17T00:00:00.000Z',
    updatedAt: '2026-04-17T00:00:00.000Z',
  }
}

test('resolvePlatformSmokeScenario returns linkedin register descriptor', () => {
  const scenario = resolvePlatformSmokeScenario('linkedin-register-smoke')

  assert.equal(scenario.platform, 'linkedin')
  assert.equal(scenario.environmentPurpose, 'register')
  assert.equal(scenario.expectedHosts.includes('www.linkedin.com'), true)
  assert.equal(scenario.selectorDiagnostics.length > 0, true)
})

test('buildPlatformSmokeProfileInput applies platform preset and proxy to linkedin smoke', () => {
  const scenario = resolvePlatformSmokeScenario('linkedin-register-smoke')
  const payload = buildPlatformSmokeProfileInput(scenario, buildProxy(), {
    profileId: 'profile-smoke-linkedin',
    profileName: 'LinkedIn Smoke',
  })

  assert.equal(payload.environmentPurpose, 'register')
  assert.equal(payload.fingerprintConfig.basicSettings.platform, 'linkedin')
  assert.equal(payload.fingerprintConfig.webrtcMode, 'proxy-aware')
  assert.equal(payload.fingerprintConfig.advanced.browserVersion, '146')
  assert.equal(payload.fingerprintConfig.proxySettings.proxyMode, 'custom')
  assert.equal(payload.tags.includes('linkedin'), true)
})

test('evaluatePlatformSmokeSuccess fails when host mismatches expected platform', () => {
  const scenario = resolvePlatformSmokeScenario('tiktok-nurture-smoke')
  const evaluation = evaluatePlatformSmokeSuccess({
    scenario,
    launchPassed: true,
    startupNavigation: {
      requestedUrl: scenario.startupUrl,
      attemptedUrl: scenario.startupUrl,
      finalUrl: 'https://example.com/',
      success: true,
      reasonCode: 'ok',
      message: 'ok',
      checkedAt: '2026-04-17T00:00:00.000Z',
    },
    probe: {
      success: true,
      finalUrl: 'https://example.com/',
      finalHost: 'example.com',
      title: 'Example',
      readyState: 'complete',
      selectorMatches: {},
    },
  })

  assert.equal(evaluation.success, false)
  assert.match(evaluation.reasons.join(' '), /final host mismatch/)
})

test('buildPlatformSmokeArtifactBaseName sanitizes optional labels', () => {
  const scenario = resolvePlatformSmokeScenario('linkedin-register-smoke')
  assert.equal(
    buildPlatformSmokeArtifactBaseName(scenario, 'Windows Canary #1'),
    'linkedin-register-smoke-windows-canary-1',
  )
})
