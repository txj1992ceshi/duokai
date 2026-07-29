import assert from 'node:assert/strict'
import test from 'node:test'

import type {
  ProfileProxySettings,
  ProxyRecord,
} from '../../src/shared/types.ts'
import type { CloakRuntimeLaunchRequest } from './cloakBrowserRuntime.ts'
import {
  applyCloakNetworkMappingToLaunchRequest,
  buildCloakNetworkMapping,
  CloakNetworkMappingError,
  type CloakNetworkMappingInput,
} from './cloakBrowserNetwork.ts'

const NOW = new Date('2026-07-27T00:00:00.000Z')

function buildProxySettings(
  overrides: Partial<ProfileProxySettings> = {},
): ProfileProxySettings {
  return {
    proxyMode: 'custom',
    ipLookupChannel: 'ipwho.is',
    proxyType: 'http',
    ipProtocol: 'ipv4',
    host: 'proxy.example',
    port: 8080,
    username: 'account-name',
    password: 'super-secret-password',
    udpEnabled: false,
    ...overrides,
  }
}

function buildProxy(overrides: Partial<ProxyRecord> = {}): ProxyRecord {
  return {
    id: 'proxy-1',
    name: 'Fixture proxy',
    type: 'http',
    host: 'proxy.example',
    port: 8080,
    username: 'account-name',
    password: 'super-secret-password',
    status: 'online',
    lastCheckedAt: NOW.toISOString(),
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  }
}

function buildInput(
  overrides: Partial<CloakNetworkMappingInput> = {},
): CloakNetworkMappingInput {
  return {
    profileId: 'profile-1',
    proxySettings: buildProxySettings(),
    webrtcMode: 'proxy-aware',
    proxy: buildProxy(),
    egress: {
      ok: true,
      source: 'proxy',
      ip: '203.0.113.25',
      country: 'United States',
      region: 'California',
      city: 'Los Angeles',
      timezone: 'America/Los_Angeles',
      language: 'en-US',
      geolocation: '34.0522, -118.2437',
      egressPathType: 'direct',
      checkedAt: '2026-07-26T23:59:30.000Z',
    },
    transport: {
      config: {
        server: 'http://127.0.0.1:45678',
        bypass: '<-loopback>',
      },
      bridgeActive: true,
      egressPathType: 'direct',
      detail: 'fixture transport',
    },
    now: NOW,
    ...overrides,
  }
}

function buildLaunchRequest(): CloakRuntimeLaunchRequest {
  return {
    userDataDir: '/tmp/duokai-network-profile',
    downloadsDir: '/tmp/duokai-network-downloads',
    cacheDir: '/tmp/duokai-network-cache',
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    fingerprintSeed: 123456,
    browserVersion: '145.0.7632.109.2',
    viewport: null,
    mappedFingerprintArgs: [
      '--fingerprint-platform=macos',
      '--fingerprint-webrtc-ip=198.51.100.8',
      '--force-webrtc-ip-handling-policy=default_public_interface_only',
    ],
  }
}

test('buildCloakNetworkMapping binds proxy, egress and WebRTC identity', () => {
  const first = buildCloakNetworkMapping(buildInput())
  const second = buildCloakNetworkMapping(buildInput())

  assert.equal(first.mappingHash, second.mappingHash)
  assert.equal(first.proxyRequired, true)
  assert.equal(first.proxyType, 'http')
  assert.equal(first.proxyEndpoint, 'http://proxy.example:8080')
  assert.equal(first.launchProxy?.server, 'http://127.0.0.1:45678')
  assert.equal(first.launchProxy?.bypass, '<-loopback>')
  assert.equal(first.verifiedWebRtcIp, '203.0.113.25')
  assert.deepEqual(first.mappedNetworkArgs, [
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--fingerprint-webrtc-ip=203.0.113.25',
  ])
  assert.deepEqual(first.geolocation, {
    latitude: 34.0522,
    longitude: -118.2437,
  })
})

test('network mapping output and hashes never contain proxy credentials', () => {
  const mapping = buildCloakNetworkMapping(buildInput())
  const serialized = JSON.stringify(mapping)
  assert.equal(serialized.includes('super-secret-password'), false)
  assert.equal(serialized.includes('account-name'), false)
  assert.equal(mapping.proxyFingerprintHash.length, 64)
  assert.equal(mapping.mappingHash.length, 64)
})

test('direct mapping rejects hidden proxy state and accepts local egress', () => {
  const mapping = buildCloakNetworkMapping(
    buildInput({
      proxySettings: buildProxySettings({ proxyMode: 'direct' }),
      proxy: null,
      transport: {
        config: null,
        bridgeActive: false,
        egressPathType: 'direct',
      },
      egress: {
        ...buildInput().egress,
        source: 'local',
      },
    }),
  )
  assert.equal(mapping.proxyRequired, false)
  assert.equal(mapping.proxyType, 'direct')
  assert.equal(mapping.launchProxy, null)

  assert.throws(
    () =>
      buildCloakNetworkMapping(
        buildInput({
          proxySettings: buildProxySettings({ proxyMode: 'direct' }),
          egress: { ...buildInput().egress, source: 'local' },
        }),
      ),
    (error: unknown) =>
      error instanceof CloakNetworkMappingError &&
      error.code === 'invalid_proxy_configuration',
  )
})

test('proxy mapping requires matching proxy egress and prepared bridge path', () => {
  for (const input of [
    buildInput({ proxy: null }),
    buildInput({ egress: { ...buildInput().egress, source: 'local' } }),
    buildInput({
      transport: {
        config: null,
        bridgeActive: false,
        egressPathType: 'direct',
      },
    }),
    buildInput({
      transport: {
        ...buildInput().transport,
        egressPathType: 'custom',
      },
    }),
  ]) {
    assert.throws(
      () => buildCloakNetworkMapping(input),
      (error: unknown) => error instanceof CloakNetworkMappingError,
    )
  }
})

test('raw upstream and credential-bearing proxy transports are blocked', () => {
  for (const config of [
    { server: 'http://proxy.example:8080' },
    { server: 'socks5://127.0.0.1:1080' },
    { server: 'http://user:pass@127.0.0.1:8080' },
    { server: 'http://127.0.0.1:8080', username: 'user', password: 'pass' },
  ]) {
    assert.throws(
      () =>
        buildCloakNetworkMapping(
          buildInput({
            transport: {
              config,
              bridgeActive: true,
              egressPathType: 'direct',
            },
          }),
        ),
      (error: unknown) =>
        error instanceof CloakNetworkMappingError &&
        error.code === 'unsafe_proxy_transport',
    )
  }
})

test('failed, stale and future egress identities are blocked', () => {
  const cases = [
    buildInput({ egress: { ...buildInput().egress, ok: false } }),
    buildInput({
      egress: {
        ...buildInput().egress,
        checkedAt: '2026-07-26T23:50:00.000Z',
      },
    }),
    buildInput({
      egress: {
        ...buildInput().egress,
        checkedAt: '2026-07-27T00:02:00.000Z',
      },
    }),
  ]
  for (const input of cases) {
    assert.throws(
      () => buildCloakNetworkMapping(input),
      (error: unknown) => error instanceof CloakNetworkMappingError,
    )
  }
})

test('IP syntax and configured IP family must match', () => {
  assert.throws(
    () =>
      buildCloakNetworkMapping(
        buildInput({ egress: { ...buildInput().egress, ip: 'not-an-ip' } }),
      ),
    (error: unknown) =>
      error instanceof CloakNetworkMappingError && error.code === 'invalid_egress_ip',
  )
  assert.throws(
    () =>
      buildCloakNetworkMapping(
        buildInput({
          proxySettings: buildProxySettings({ ipProtocol: 'ipv6' }),
        }),
      ),
    (error: unknown) =>
      error instanceof CloakNetworkMappingError &&
      error.code === 'ip_protocol_mismatch',
  )
})

test('proxy-bound default WebRTC is blocked and disabled mode does not publish IP', () => {
  assert.throws(
    () => buildCloakNetworkMapping(buildInput({ webrtcMode: 'default' })),
    (error: unknown) =>
      error instanceof CloakNetworkMappingError &&
      error.code === 'unsafe_webrtc_policy',
  )
  const disabled = buildCloakNetworkMapping(
    buildInput({ webrtcMode: 'disabled' }),
  )
  assert.equal(disabled.verifiedWebRtcIp, '')
  assert.deepEqual(disabled.mappedNetworkArgs, ['--disable-webrtc'])
})

test('missing optional geolocation produces a warning without inventing coordinates', () => {
  const mapping = buildCloakNetworkMapping(
    buildInput({ egress: { ...buildInput().egress, geolocation: '' } }),
  )
  assert.equal(mapping.geolocation, null)
  assert.equal(mapping.compatibilityWarnings.length, 1)
})

test('applyCloakNetworkMappingToLaunchRequest replaces prior WebRTC arguments', () => {
  const mapping = buildCloakNetworkMapping(buildInput())
  const request = applyCloakNetworkMappingToLaunchRequest(
    buildLaunchRequest(),
    mapping,
  )
  assert.equal(request.proxy?.server, 'http://127.0.0.1:45678')
  assert.equal(
    request.mappedFingerprintArgs?.includes('--fingerprint-platform=macos'),
    true,
  )
  assert.equal(
    request.mappedFingerprintArgs?.includes('--fingerprint-webrtc-ip=198.51.100.8'),
    false,
  )
  assert.equal(
    request.mappedFingerprintArgs?.includes('--fingerprint-webrtc-ip=203.0.113.25'),
    true,
  )
  assert.equal(
    request.mappedFingerprintArgs?.includes(
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    ),
    true,
  )
})
