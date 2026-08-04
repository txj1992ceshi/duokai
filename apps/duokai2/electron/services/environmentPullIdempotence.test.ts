import assert from 'node:assert/strict'
import test from 'node:test'

import type { ProfileRecord } from '../../src/shared/types'
import {
  buildEnvironmentProfileSemanticProjection,
  shouldApplyPulledEnvironmentProfile,
} from './environmentPullIdempotence.ts'

function profile(): ProfileRecord {
  return {
    id: 'profile-one',
    name: 'Profile One',
    proxyId: 'proxy-one',
    groupName: 'LinkedIn',
    tags: ['operation', 'priority'],
    notes: 'Stable environment',
    status: 'stopped',
    environmentPurpose: 'operation',
    deviceProfile: {
      version: 1,
      deviceClass: 'desktop',
      operatingSystem: 'Windows',
      platform: 'Win32',
      browserKernel: 'chrome',
      browserVersion: '145.0.7632.109',
      userAgent: 'Mozilla/5.0 Windows Chrome/145.0.7632.109',
      viewport: { width: 1920, height: 1080 },
      locale: {
        language: 'en-US',
        interfaceLanguage: 'en-US',
        timezone: 'Asia/Tokyo',
        geolocation: '35.6762,139.6503',
      },
      hardware: {
        cpuCores: 8,
        memoryGb: 16,
        webglVendor: 'Google Inc. (NVIDIA)',
        webglRenderer: 'ANGLE (NVIDIA GeForce)',
      },
      mediaProfile: {
        fontMode: 'random',
        mediaDevicesMode: 'random',
        speechVoicesMode: 'random',
        canvasMode: 'random',
        webglImageMode: 'random',
        webglMetadataMode: 'random',
        audioContextMode: 'random',
        clientRectsMode: 'random',
      },
      support: {
        fonts: 'active',
        mediaDevices: 'active',
        speechVoices: 'active',
        canvas: 'active',
        webgl: 'active',
        audio: 'active',
        clientRects: 'active',
        geolocation: 'active',
        deviceInfo: 'active',
        sslFingerprint: 'active',
        pluginFingerprint: 'active',
      },
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-28T18:50:24.619Z',
    },
    fingerprintConfig: {
      userAgent: 'Mozilla/5.0 Windows Chrome/145.0.7632.109',
      language: 'en-US',
      timezone: 'Asia/Tokyo',
      resolution: '1920x1080',
      webrtcMode: 'proxy-aware',
      basicSettings: {
        platform: 'linkedin',
        customPlatformName: '',
        customPlatformUrl: 'https://www.linkedin.com/',
        platformUsername: '',
        platformPassword: '',
        validateByUsername: false,
        multiOpenMode: 'deny',
        twoFactorSecret: '',
        cookieSeed: 'cookie-seed',
      },
      proxySettings: {
        proxyMode: 'custom',
        ipLookupChannel: 'default',
        proxyType: 'http',
        ipProtocol: 'ipv4',
        host: 'proxy.example.com',
        port: 8080,
        username: 'user',
        password: 'secret',
        udpEnabled: false,
      },
      commonSettings: {
        pageMode: 'local',
        blockImages: false,
        blockImagesAboveKb: 0,
        syncTabs: true,
        syncCookies: true,
        clearCacheOnLaunch: false,
        randomizeFingerprintOnLaunch: false,
        allowChromeLogin: false,
        hardwareAcceleration: true,
        memorySaver: false,
      },
      advanced: {
        browserKernel: 'chrome',
        browserKernelVersion: '145',
        deviceMode: 'desktop',
        operatingSystem: 'Windows',
        operatingSystemVersion: '10',
        browserVersion: '145.0.7632.109',
        autoLanguageFromIp: false,
        autoInterfaceLanguageFromIp: false,
        interfaceLanguage: 'en-US',
        autoTimezoneFromIp: false,
        autoGeolocationFromIp: false,
        geolocationPermission: 'allow',
        geolocation: '35.6762,139.6503',
        windowWidth: 1920,
        windowHeight: 1080,
        resolutionMode: 'custom',
        fontMode: 'random',
        canvasMode: 'random',
        webglImageMode: 'random',
        webglMetadataMode: 'random',
        webglVendor: 'Google Inc. (NVIDIA)',
        webglRenderer: 'ANGLE (NVIDIA GeForce)',
        audioContextMode: 'random',
        mediaDevicesMode: 'random',
        speechVoicesMode: 'random',
        doNotTrackEnabled: false,
        clientRectsMode: 'random',
        deviceInfoMode: 'custom',
        deviceName: 'DESKTOP-TEST',
        hostIp: '',
        macAddress: '',
        portScanProtection: true,
        portScanAllowlist: '',
        sslFingerprintMode: 'enabled',
        customPluginFingerprint: 'enabled',
        cpuMode: 'custom',
        cpuCores: 8,
        memoryGb: 16,
        launchArgs: '--disable-features=Translate',
      },
      runtimeMetadata: {
        lastEnvironmentSyncAt: '2026-07-28T18:50:24.619Z',
        lastEnvironmentSyncStatus: 'synced',
        lastEnvironmentSyncMessage: 'synced',
        lastEnvironmentSyncVersion: 8,
        lastResolvedIp: '203.0.113.1',
        lastResolvedAt: '2026-07-28T18:50:24.619Z',
        lastValidationLevel: 'pass',
        lastValidationMessages: [],
        trustedSnapshotStatus: 'trusted',
        trustedLaunchSnapshot: { status: 'trusted' },
        launchValidationStage: 'idle',
        launchRetryCount: 0,
        pendingSyncKinds: [],
        hardwareProfileId: 'hardware-one',
        hardwareProfileVersion: '1',
        hardwareSeed: 'stable-seed',
        hardwareProfileSource: 'generated',
        hardwareTemplateId: 'windows-office',
        hardwareVariantId: 'nvidia-8-16',
        hardwareCatalogVersion: '2026-07',
      } as unknown as ProfileRecord['fingerprintConfig']['runtimeMetadata'],
    },
    workspace: {
      identityProfileId: 'profile-one',
      version: 1,
      migrationState: 'completed',
      migrationCheckpoints: [{ name: 'migration_completed', completedAt: '2026-07-01T00:00:00.000Z' }],
      templateBinding: {
        templateId: 'linkedin-windows',
        templateRevision: '1',
        templateFingerprintHash: 'template-hash',
      },
      allowedOverrides: ['timezone', 'browserLanguage'],
      blockedOverrides: ['profileDir', 'webrtcHardPolicy'],
      declaredOverrides: { timezone: 'Asia/Tokyo' },
      resolvedEnvironment: {
        browserFamily: 'chrome',
        browserMajorVersionRange: '145',
        systemLanguage: 'en-US',
        browserLanguage: 'en-US',
        timezone: 'Asia/Tokyo',
        resolution: '1920x1080',
        fontStrategy: 'random',
        webrtcPolicy: 'proxy-aware',
        ipv6Policy: 'ipv4',
        downloadsDir: '/Users/test/workspaces/profile-one/downloads',
        launchArgs: ['--disable-features=Translate'],
      },
      paths: {
        profileDir: '/Users/test/workspaces/profile-one/profile',
        cacheDir: '/Users/test/workspaces/profile-one/cache',
        downloadsDir: '/Users/test/workspaces/profile-one/downloads',
        extensionsDir: '/Users/test/workspaces/profile-one/extensions',
        metaDir: '/Users/test/workspaces/profile-one/meta',
      },
      healthSummary: { status: 'healthy', messages: [], checkedAt: '2026-07-28T18:50:24.619Z' },
      consistencySummary: {
        status: 'pass',
        messages: [],
        checkedAt: '2026-07-28T18:50:24.619Z',
        templateFingerprintHash: 'template-hash',
        templateRevision: '1',
      },
      trustSummary: {
        lastQuickIsolationCheckAt: '2026-07-28T18:50:24.619Z',
        lastQuickIsolationCheckSuccess: true,
        lastQuickIsolationCheckMessage: 'pass',
        trustedSnapshotStatus: 'trusted',
        trustedLaunchVerifiedAt: '2026-07-28T18:50:24.619Z',
        activeRuntimeLock: {
          state: 'unlocked',
          ownerDeviceId: '',
          ownerPid: null,
          updatedAt: '2026-07-28T18:50:24.619Z',
        },
      },
      snapshotSummary: {
        lastSnapshotId: 'snapshot-one',
        lastSnapshotAt: '2026-07-28T18:50:24.619Z',
        lastKnownGoodSnapshotId: 'snapshot-one',
        lastKnownGoodSnapshotAt: '2026-07-28T18:50:24.619Z',
        lastKnownGoodStatus: 'valid',
        lastKnownGoodInvalidatedAt: '',
        lastKnownGoodInvalidationReason: '',
      },
      recovery: { lastRecoveryAt: '', lastRecoveryReason: '' },
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-28T18:50:24.619Z',
    lastStartedAt: '',
  }
}

function clone(value: ProfileRecord): ProfileRecord {
  return structuredClone(value)
}

test('volatile runtime, sync, receipt, path and timestamp drift is a zero-write pull no-op', () => {
  const local = profile()
  const remote = clone(local)

  remote.status = 'running'
  remote.updatedAt = '2026-07-29T15:55:54.000Z'
  remote.lastStartedAt = '2026-07-29T15:55:54.000Z'
  remote.tags.reverse()
  remote.deviceProfile.createdAt = '2026-07-29T00:00:00.000Z'
  remote.deviceProfile.updatedAt = '2026-07-29T15:55:54.000Z'
  remote.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncAt = '2026-07-29T15:55:54.000Z'
  remote.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncStatus = 'syncing'
  remote.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncMessage = 'cloud receipt changed'
  remote.fingerprintConfig.runtimeMetadata.lastEnvironmentSyncVersion = 99
  remote.fingerprintConfig.runtimeMetadata.lastResolvedIp = '198.51.100.2'
  remote.fingerprintConfig.runtimeMetadata.lastValidationLevel = 'warn'
  remote.fingerprintConfig.runtimeMetadata.trustedSnapshotStatus = 'stale'
  remote.workspace!.paths = {
    profileDir: 'workspaces/profile-one/profile',
    cacheDir: 'workspaces/profile-one/cache',
    downloadsDir: 'workspaces/profile-one/downloads',
    extensionsDir: 'workspaces/profile-one/extensions',
    metaDir: 'workspaces/profile-one/meta',
  }
  remote.workspace!.resolvedEnvironment.downloadsDir = 'workspaces/profile-one/downloads'
  remote.workspace!.templateBinding.templateFingerprintHash = 'stale-cloud-derived-receipt'
  remote.workspace!.healthSummary.checkedAt = '2026-07-29T15:55:54.000Z'
  remote.workspace!.healthSummary.status = 'warning'
  remote.workspace!.trustSummary.activeRuntimeLock = {
    state: 'locked',
    ownerDeviceId: 'another-device',
    ownerPid: 123,
    updatedAt: '2026-07-29T15:55:54.000Z',
  }
  remote.workspace!.snapshotSummary.lastSnapshotAt = '2026-07-29T15:55:54.000Z'
  remote.workspace!.recovery.lastRecoveryAt = '2026-07-29T15:55:54.000Z'

  assert.deepEqual(
    buildEnvironmentProfileSemanticProjection(local),
    buildEnvironmentProfileSemanticProjection(remote),
  )
  assert.equal(shouldApplyPulledEnvironmentProfile(local, remote), false)
})

test('stable hardware identity changes require applying the cloud profile', () => {
  const local = profile()
  const remote = clone(local)
  remote.fingerprintConfig.runtimeMetadata.hardwareSeed = 'different-seed'

  assert.equal(shouldApplyPulledEnvironmentProfile(local, remote), true)
})

test('configured fingerprint and proxy changes require applying the cloud profile', () => {
  const local = profile()
  const remote = clone(local)
  remote.fingerprintConfig.proxySettings.host = 'new-proxy.example.com'

  assert.equal(shouldApplyPulledEnvironmentProfile(local, remote), true)
})

test('device hardware changes require applying the cloud profile', () => {
  const local = profile()
  const remote = clone(local)
  remote.deviceProfile.hardware.cpuCores = 12

  assert.equal(shouldApplyPulledEnvironmentProfile(local, remote), true)
})

test('workspace resolved configuration changes require applying the cloud profile', () => {
  const local = profile()
  const remote = clone(local)
  remote.workspace!.resolvedEnvironment.timezone = 'America/Los_Angeles'

  assert.equal(shouldApplyPulledEnvironmentProfile(local, remote), true)
})

test('profile fields persisted by the pull path remain semantic', () => {
  const local = profile()
  const remote = clone(local)
  remote.name = 'Renamed Profile'

  assert.equal(shouldApplyPulledEnvironmentProfile(local, remote), true)
})

test('missing or mismatched local profile requires applying the cloud profile', () => {
  const remote = profile()
  assert.equal(shouldApplyPulledEnvironmentProfile(null, remote), true)

  const local = profile()
  local.id = 'different-profile'
  assert.equal(shouldApplyPulledEnvironmentProfile(local, remote), true)
})
