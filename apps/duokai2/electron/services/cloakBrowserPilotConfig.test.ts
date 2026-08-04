import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import type { FingerprintConfig, ProfileRecord } from '../../src/shared/types.ts'
import {
  buildCloakPilotRuntimeProfile,
  CloakPilotLocalConfigError,
  evaluateCloakPilotLocalEligibility,
  readCloakPilotLocalConfig,
  setCloakPilotProfileEnabled,
  validateCloakPilotCompatibilityReceipt,
} from './cloakBrowserPilotConfig.ts'

async function withTempDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-pilot-config-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function createProfile(id = 'profile-phase5c'): ProfileRecord {
  const fingerprintConfig: FingerprintConfig = {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    language: 'en-US',
    timezone: 'America/Los_Angeles',
    resolution: '1440x900',
    webrtcMode: 'proxy-aware',
    basicSettings: {} as FingerprintConfig['basicSettings'],
    proxySettings: {} as FingerprintConfig['proxySettings'],
    commonSettings: {} as FingerprintConfig['commonSettings'],
    advanced: {
      browserKernel: 'chrome',
      browserKernelVersion: '147.0.0.0',
      browserVersion: '147.0.0.0',
      deviceMode: 'desktop',
      operatingSystem: 'macOS',
      operatingSystemVersion: '15.5.0',
    } as FingerprintConfig['advanced'],
    runtimeMetadata: {} as FingerprintConfig['runtimeMetadata'],
  }
  return {
    id,
    name: 'Phase 5C profile',
    proxyId: null,
    groupName: 'tests',
    tags: [],
    notes: '',
    environmentPurpose: 'operation',
    deviceProfile: {
      browserKernel: 'chrome',
      browserVersion: '147.0.0.0',
      userAgent: fingerprintConfig.userAgent,
    } as ProfileRecord['deviceProfile'],
    fingerprintConfig,
    status: 'stopped',
    lastStartedAt: null,
    createdAt: '2026-07-27T00:00:00.000Z',
    updatedAt: '2026-07-27T00:00:00.000Z',
  }
}

test('local Pilot configuration is default-off when the file is missing', async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, 'pilot-config.json')
    const loaded = await readCloakPilotLocalConfig(filePath)
    assert.equal(loaded.exists, false)
    assert.deepEqual(loaded.config.enabledProfileIds, [])
    assert.equal(evaluateCloakPilotLocalEligibility('profile-a', loaded).reason, 'config_missing')
  })
})

test('enabling a concrete Profile ID persists an atomic 0600 local-only allowlist', async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, 'cloak-pilot', 'pilot-config.json')
    const enabled = await setCloakPilotProfileEnabled(
      filePath,
      'profile-a',
      true,
      new Date('2026-07-27T01:00:00.000Z'),
    )
    assert.equal(enabled.exists, true)
    assert.deepEqual(enabled.config.enabledProfileIds, ['profile-a'])
    assert.equal(evaluateCloakPilotLocalEligibility('profile-a', enabled).enabled, true)
    assert.equal(evaluateCloakPilotLocalEligibility('profile-b', enabled).reason, 'profile_not_enabled')
    if (process.platform !== 'win32') {
      assert.equal((await stat(filePath)).mode & 0o777, 0o600)
      assert.equal((await stat(path.dirname(filePath))).mode & 0o777, 0o700)
    }
    const files = await readFile(filePath, 'utf8')
    assert.match(files, /"profile-a"/)
  })
})

test('wildcards and insecure local configuration files fail closed', async () => {
  await withTempDirectory(async (directory) => {
    const wildcardPath = path.join(directory, 'wildcard.json')
    await writeFile(
      wildcardPath,
      JSON.stringify({ schemaVersion: 1, enabledProfileIds: ['*'], updatedAt: '' }),
      { mode: 0o600 },
    )
    const wildcard = await readCloakPilotLocalConfig(wildcardPath)
    assert.deepEqual(wildcard.config.enabledProfileIds, [])

    if (process.platform !== 'win32') {
      const insecurePath = path.join(directory, 'insecure.json')
      await writeFile(
        insecurePath,
        JSON.stringify({ schemaVersion: 1, enabledProfileIds: ['profile-a'], updatedAt: '' }),
        { mode: 0o600 },
      )
      await chmod(insecurePath, 0o644)
      await assert.rejects(
        readCloakPilotLocalConfig(insecurePath),
        (error: unknown) =>
          error instanceof CloakPilotLocalConfigError && error.code === 'invalid_permissions',
      )
    }
  })
})

test('runtime overlay aligns 147 to fixed Cloak 145 without mutating the stored Profile', async () => {
  await withTempDirectory(async (directory) => {
    const profile = createProfile()
    const original = structuredClone(profile)
    const filePath = path.join(directory, 'pilot-config.json')
    const loaded = await setCloakPilotProfileEnabled(
      filePath,
      profile.id,
      true,
      new Date('2026-07-27T02:00:00.000Z'),
    )
    const eligibility = evaluateCloakPilotLocalEligibility(profile.id, loaded)
    const result = buildCloakPilotRuntimeProfile(profile, eligibility)

    assert.deepEqual(profile, original)
    assert.equal(result.profile.fingerprintConfig.advanced.browserVersion, '145.0.7632.109.2')
    assert.equal(result.profile.fingerprintConfig.advanced.browserKernelVersion, '145.0.7632.109.2')
    assert.match(result.profile.fingerprintConfig.userAgent, /Chrome\/145\.0\.7632\.109/)
    assert.equal(result.profile.deviceProfile.browserVersion, '145.0.7632.109')
    assert.equal(result.compatibility.storedBrowserVersion, '147.0.0.0')
    assert.equal(result.compatibility.effectiveChromiumMajor, '145')
    validateCloakPilotCompatibilityReceipt(result.compatibility)

    const tampered = structuredClone(result.compatibility)
    tampered.effectiveChromiumMajor = '146'
    assert.throws(() => validateCloakPilotCompatibilityReceipt(tampered))
  })
})

test('runtime overlay aligns a partial legacy noise policy without mutating the stored Profile', async () => {
  await withTempDirectory(async (directory) => {
    const profile = createProfile('profile-partial-noise')
    profile.fingerprintConfig.advanced.canvasMode = 'custom'
    profile.fingerprintConfig.advanced.webglImageMode = 'custom'
    profile.fingerprintConfig.advanced.audioContextMode = 'custom'
    profile.fingerprintConfig.advanced.clientRectsMode = 'off'
    const original = structuredClone(profile)
    const filePath = path.join(directory, 'pilot-config.json')
    const loaded = await setCloakPilotProfileEnabled(filePath, profile.id, true)
    const eligibility = evaluateCloakPilotLocalEligibility(profile.id, loaded)
    const result = buildCloakPilotRuntimeProfile(profile, eligibility)

    assert.deepEqual(profile, original)
    assert.deepEqual(result.compatibility.storedNoiseModes, {
      canvas: 'custom',
      webglImage: 'custom',
      audioContext: 'custom',
      clientRects: 'off',
    })
    assert.deepEqual(result.compatibility.effectiveNoiseModes, {
      canvas: 'custom',
      webglImage: 'custom',
      audioContext: 'custom',
      clientRects: 'custom',
    })
    assert.equal(result.compatibility.effectiveNoisePolicy, 'native-seed-derived')
    assert.deepEqual(
      result.compatibility.modifiedFields.filter((field) => field.includes('Mode')),
      ['fingerprintConfig.advanced.clientRectsMode'],
    )
    assert.equal(result.profile.fingerprintConfig.advanced.canvasMode, 'custom')
    assert.equal(result.profile.fingerprintConfig.advanced.webglImageMode, 'custom')
    assert.equal(result.profile.fingerprintConfig.advanced.audioContextMode, 'custom')
    assert.equal(result.profile.fingerprintConfig.advanced.clientRectsMode, 'custom')
    assert.match(result.compatibility.compatibilityWarnings[0] || '', /stored Profile was not modified/)
    validateCloakPilotCompatibilityReceipt(result.compatibility)
  })
})

test('disabling a Profile ID removes only that exact local allowlist entry', async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, 'pilot-config.json')
    await setCloakPilotProfileEnabled(filePath, 'profile-a', true)
    await setCloakPilotProfileEnabled(filePath, 'profile-b', true)
    const disabled = await setCloakPilotProfileEnabled(filePath, 'profile-a', false)
    assert.deepEqual(disabled.config.enabledProfileIds, ['profile-b'])
  })
})
