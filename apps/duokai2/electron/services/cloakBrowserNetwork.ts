import { createHash } from 'node:crypto'
import { isIP } from 'node:net'

import type {
  EgressPathType,
  ProfileProxySettings,
  ProxyRecord,
  WebRtcMode,
} from '../../src/shared/types.ts'
import type {
  CloakRuntimeLaunchRequest,
  CloakRuntimeProxyConfig,
} from './cloakBrowserRuntime.ts'

export const CLOAK_NETWORK_MAPPING_VERSION = 1
export const DEFAULT_NETWORK_IDENTITY_MAX_AGE_MS = 5 * 60 * 1_000

export type CloakNetworkMappingErrorCode =
  | 'invalid_profile'
  | 'invalid_proxy_configuration'
  | 'missing_proxy_transport'
  | 'unsafe_proxy_transport'
  | 'egress_check_failed'
  | 'egress_source_mismatch'
  | 'stale_network_identity'
  | 'invalid_egress_ip'
  | 'ip_protocol_mismatch'
  | 'missing_network_metadata'
  | 'unsafe_webrtc_policy'

export class CloakNetworkMappingError extends Error {
  readonly code: CloakNetworkMappingErrorCode

  constructor(code: CloakNetworkMappingErrorCode, message: string) {
    super(message)
    this.name = 'CloakNetworkMappingError'
    this.code = code
  }
}

export interface CloakVerifiedEgressIdentity {
  ok: boolean
  source: 'local' | 'proxy'
  ip: string
  country: string
  region: string
  city: string
  timezone: string
  language: string
  geolocation: string
  egressPathType: EgressPathType
  checkedAt: string
}

export interface CloakPreparedProxyTransport {
  config: CloakRuntimeProxyConfig | null
  bridgeActive: boolean
  egressPathType: EgressPathType
  detail?: string
}

export interface CloakNetworkMappingInput {
  profileId: string
  proxySettings: ProfileProxySettings
  webrtcMode: WebRtcMode
  proxy: ProxyRecord | null
  egress: CloakVerifiedEgressIdentity
  transport: CloakPreparedProxyTransport
  now?: Date
  maxAgeMs?: number
}

export interface CloakNetworkGeolocation {
  latitude: number
  longitude: number
}

export interface CloakNetworkMapping {
  schemaVersion: number
  profileId: string
  proxyRequired: boolean
  proxyMode: ProfileProxySettings['proxyMode']
  proxyId: string
  proxyType: ProxyRecord['type'] | 'direct'
  proxyEndpoint: string
  proxyFingerprintHash: string
  launchProxy: CloakRuntimeProxyConfig | null
  egress: CloakVerifiedEgressIdentity
  geolocation: CloakNetworkGeolocation | null
  ipv6Policy: ProfileProxySettings['ipProtocol']
  webrtcMode: WebRtcMode
  verifiedWebRtcIp: string
  mappedNetworkArgs: string[]
  compatibilityWarnings: string[]
  mappingHash: string
}

const NETWORK_ARGUMENT_KEYS = new Set([
  '--fingerprint-webrtc-ip',
  '--disable-webrtc',
  '--force-webrtc-ip-handling-policy',
  '--webrtc-ip-handling-policy',
])

function trim(value: unknown): string {
  return String(value ?? '').trim()
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function normalizeHost(host: string): string {
  return trim(host).toLowerCase()
}

function assertValidProxy(proxy: ProxyRecord): void {
  const host = normalizeHost(proxy.host)
  const port = Number(proxy.port)
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new CloakNetworkMappingError(
      'invalid_proxy_configuration',
      'The selected proxy must have a valid host and TCP port.',
    )
  }
  if (!['http', 'https', 'socks5'].includes(proxy.type)) {
    throw new CloakNetworkMappingError(
      'invalid_proxy_configuration',
      `Unsupported proxy protocol: ${proxy.type}.`,
    )
  }
}

function proxyFingerprint(proxy: ProxyRecord | null): string {
  if (!proxy) {
    return hashJson({ mode: 'direct' })
  }
  return hashJson({
    id: trim(proxy.id),
    type: proxy.type,
    host: normalizeHost(proxy.host),
    port: Number(proxy.port),
    authentication: Boolean(trim(proxy.username) || trim(proxy.password)),
  })
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function normalizePreparedProxy(
  transport: CloakPreparedProxyTransport,
): CloakRuntimeProxyConfig {
  if (!transport.bridgeActive || !transport.config) {
    throw new CloakNetworkMappingError(
      'missing_proxy_transport',
      'A proxy-bound Cloak launch requires a prepared local proxy bridge.',
    )
  }
  const server = trim(transport.config.server)
  let parsed: URL
  try {
    parsed = new URL(server)
  } catch {
    throw new CloakNetworkMappingError(
      'unsafe_proxy_transport',
      'The prepared proxy bridge server is not a valid URL.',
    )
  }
  if (parsed.protocol !== 'http:' || !isLoopbackHostname(parsed.hostname) || !parsed.port) {
    throw new CloakNetworkMappingError(
      'unsafe_proxy_transport',
      'Cloak must receive an authenticated local HTTP bridge, not raw upstream proxy credentials.',
    )
  }
  if (
    parsed.username ||
    parsed.password ||
    trim(transport.config.username) ||
    trim(transport.config.password)
  ) {
    throw new CloakNetworkMappingError(
      'unsafe_proxy_transport',
      'Prepared Cloak proxy transport must not expose upstream credentials to the browser wrapper.',
    )
  }
  return {
    server: parsed.toString().replace(/\/$/, ''),
    ...(trim(transport.config.bypass) ? { bypass: trim(transport.config.bypass) } : {}),
  }
}

function assertFreshEgress(
  egress: CloakVerifiedEgressIdentity,
  now: Date,
  maxAgeMs: number,
): void {
  if (!egress.ok) {
    throw new CloakNetworkMappingError(
      'egress_check_failed',
      'Cloak network identity cannot be built from a failed egress check.',
    )
  }
  const checkedAtMs = Date.parse(egress.checkedAt)
  if (!Number.isFinite(checkedAtMs)) {
    throw new CloakNetworkMappingError(
      'stale_network_identity',
      'The verified egress identity is missing a valid checkedAt timestamp.',
    )
  }
  const ageMs = now.getTime() - checkedAtMs
  if (ageMs < -30_000 || ageMs > maxAgeMs) {
    throw new CloakNetworkMappingError(
      'stale_network_identity',
      `The verified egress identity is outside the allowed ${maxAgeMs} ms freshness window.`,
    )
  }
}

function parseGeolocation(value: string): CloakNetworkGeolocation | null {
  const normalized = trim(value)
  if (!normalized) {
    return null
  }
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!match) {
    throw new CloakNetworkMappingError(
      'missing_network_metadata',
      `Invalid verified geolocation: "${normalized}".`,
    )
  }
  const latitude = Number(match[1])
  const longitude = Number(match[2])
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new CloakNetworkMappingError(
      'missing_network_metadata',
      `Verified geolocation is outside valid bounds: "${normalized}".`,
    )
  }
  return { latitude, longitude }
}

function buildWebRtcMapping(
  mode: WebRtcMode,
  proxyRequired: boolean,
  egressIp: string,
): { verifiedWebRtcIp: string; args: string[] } {
  if (mode === 'disabled') {
    return { verifiedWebRtcIp: '', args: ['--disable-webrtc'] }
  }
  if (mode === 'default') {
    if (proxyRequired) {
      throw new CloakNetworkMappingError(
        'unsafe_webrtc_policy',
        'Proxy-bound Cloak profiles cannot use the default WebRTC policy.',
      )
    }
    return { verifiedWebRtcIp: '', args: [] }
  }
  return {
    verifiedWebRtcIp: egressIp,
    args: [
      '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
      `--fingerprint-webrtc-ip=${egressIp}`,
    ],
  }
}

function mappingHash(
  mapping: Omit<CloakNetworkMapping, 'mappingHash' | 'launchProxy'>,
): string {
  return hashJson(mapping)
}

export function buildCloakNetworkMapping(
  input: CloakNetworkMappingInput,
): CloakNetworkMapping {
  const profileId = trim(input.profileId)
  if (!profileId) {
    throw new CloakNetworkMappingError('invalid_profile', 'profileId is required.')
  }
  const maxAgeMs = input.maxAgeMs ?? DEFAULT_NETWORK_IDENTITY_MAX_AGE_MS
  if (!Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    throw new CloakNetworkMappingError(
      'stale_network_identity',
      'maxAgeMs must be a positive finite number.',
    )
  }
  const proxyRequired = input.proxySettings.proxyMode !== 'direct'
  assertFreshEgress(input.egress, input.now ?? new Date(), maxAgeMs)

  const egressIp = trim(input.egress.ip)
  const ipFamily = isIP(egressIp)
  if (ipFamily === 0) {
    throw new CloakNetworkMappingError(
      'invalid_egress_ip',
      `Invalid verified egress IP: "${egressIp}".`,
    )
  }
  const expectedFamily = input.proxySettings.ipProtocol === 'ipv6' ? 6 : 4
  if (ipFamily !== expectedFamily) {
    throw new CloakNetworkMappingError(
      'ip_protocol_mismatch',
      `Verified egress IP family IPv${ipFamily} does not match the profile IPv${expectedFamily} policy.`,
    )
  }
  if (!trim(input.egress.timezone) || !trim(input.egress.language)) {
    throw new CloakNetworkMappingError(
      'missing_network_metadata',
      'Verified egress identity must include timezone and language.',
    )
  }

  let launchProxy: CloakRuntimeProxyConfig | null = null
  let proxyType: CloakNetworkMapping['proxyType'] = 'direct'
  let proxyId = ''
  let proxyEndpoint = 'direct'
  if (proxyRequired) {
    if (!input.proxy) {
      throw new CloakNetworkMappingError(
        'invalid_proxy_configuration',
        'The profile requires a proxy but no proxy record was supplied.',
      )
    }
    assertValidProxy(input.proxy)
    if (input.egress.source !== 'proxy') {
      throw new CloakNetworkMappingError(
        'egress_source_mismatch',
        'A proxy-bound profile requires an egress result produced through the proxy.',
      )
    }
    if (input.egress.egressPathType !== input.transport.egressPathType) {
      throw new CloakNetworkMappingError(
        'egress_source_mismatch',
        'The verified egress path does not match the prepared proxy transport path.',
      )
    }
    launchProxy = normalizePreparedProxy(input.transport)
    proxyType = input.proxy.type
    proxyId = trim(input.proxy.id)
    proxyEndpoint = `${input.proxy.type}://${normalizeHost(input.proxy.host)}:${input.proxy.port}`
  } else {
    if (input.proxy || input.transport.config || input.transport.bridgeActive) {
      throw new CloakNetworkMappingError(
        'invalid_proxy_configuration',
        'A direct profile cannot carry a proxy record or prepared proxy transport.',
      )
    }
    if (input.egress.source !== 'local' || input.egress.egressPathType !== 'direct') {
      throw new CloakNetworkMappingError(
        'egress_source_mismatch',
        'A direct profile requires a local direct egress result.',
      )
    }
  }

  const geolocation = parseGeolocation(input.egress.geolocation)
  const webrtc = buildWebRtcMapping(input.webrtcMode, proxyRequired, egressIp)
  const compatibilityWarnings: string[] = []
  if (!geolocation) {
    compatibilityWarnings.push(
      'Verified egress identity has no geolocation coordinates; automatic geolocation mapping must remain disabled.',
    )
  }
  const proxyFingerprintHash = proxyFingerprint(input.proxy)
  const egress: CloakVerifiedEgressIdentity = {
    ...input.egress,
    ip: egressIp,
    country: trim(input.egress.country),
    region: trim(input.egress.region),
    city: trim(input.egress.city),
    timezone: trim(input.egress.timezone),
    language: trim(input.egress.language),
    geolocation: trim(input.egress.geolocation),
  }
  const withoutHash: Omit<CloakNetworkMapping, 'mappingHash'> = {
    schemaVersion: CLOAK_NETWORK_MAPPING_VERSION,
    profileId,
    proxyRequired,
    proxyMode: input.proxySettings.proxyMode,
    proxyId,
    proxyType,
    proxyEndpoint,
    proxyFingerprintHash,
    launchProxy,
    egress,
    geolocation,
    ipv6Policy: input.proxySettings.ipProtocol,
    webrtcMode: input.webrtcMode,
    verifiedWebRtcIp: webrtc.verifiedWebRtcIp,
    mappedNetworkArgs: webrtc.args,
    compatibilityWarnings,
  }
  const hashInput: Omit<CloakNetworkMapping, 'mappingHash' | 'launchProxy'> = {
    schemaVersion: withoutHash.schemaVersion,
    profileId: withoutHash.profileId,
    proxyRequired: withoutHash.proxyRequired,
    proxyMode: withoutHash.proxyMode,
    proxyId: withoutHash.proxyId,
    proxyType: withoutHash.proxyType,
    proxyEndpoint: withoutHash.proxyEndpoint,
    proxyFingerprintHash: withoutHash.proxyFingerprintHash,
    egress: withoutHash.egress,
    geolocation: withoutHash.geolocation,
    ipv6Policy: withoutHash.ipv6Policy,
    webrtcMode: withoutHash.webrtcMode,
    verifiedWebRtcIp: withoutHash.verifiedWebRtcIp,
    mappedNetworkArgs: withoutHash.mappedNetworkArgs,
    compatibilityWarnings: withoutHash.compatibilityWarnings,
  }
  return {
    ...withoutHash,
    mappingHash: mappingHash(hashInput),
  }
}

export function applyCloakNetworkMappingToLaunchRequest(
  request: CloakRuntimeLaunchRequest,
  mapping: CloakNetworkMapping,
): CloakRuntimeLaunchRequest {
  const preservedArgs = (request.mappedFingerprintArgs ?? []).filter(
    (argument) => !NETWORK_ARGUMENT_KEYS.has(argument.split('=')[0] || argument),
  )
  return {
    ...request,
    proxy: mapping.launchProxy ?? undefined,
    mappedFingerprintArgs: Array.from(
      new Set([...preservedArgs, ...mapping.mappedNetworkArgs]),
    ),
  }
}
