import http, {
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'

import type {
  ProfileProxySettings,
  ProxyRecord,
} from '../src/shared/types.ts'
import {
  applyCloakNetworkMappingToLaunchRequest,
  buildCloakNetworkMapping,
  type CloakNetworkMapping,
} from '../electron/services/cloakBrowserNetwork.ts'
import {
  closeCloakContextSafely,
  launchCloakPersistentContext,
  type CloakBrowserContextLike,
  type CloakBrowserPageLike,
  type CloakRuntimeLaunchRequest,
} from '../electron/services/cloakBrowserRuntime.ts'

const BROWSER_VERSION = '145.0.7632.109.2'
const VERIFIED_EGRESS_IP = '203.0.113.25'
const SENTINEL_USERNAME = 'phase3-sentinel-user'
const SENTINEL_PASSWORD = 'phase3-sentinel-password'
const FIXTURE_HOST = 'phase3-network.test'

interface NetworkProbe {
  bodyText: string
  language: string
  languages: string[]
  timezone: string
  webdriver: boolean | null
  geolocation: {
    latitude: number
    longitude: number
    accuracy: number
  } | null
  geolocationError: string
  iceCandidates: string[]
  candidateAddresses: string[]
}

interface NetworkSmokeReport {
  success: boolean
  startedAt: string
  finishedAt: string
  browserVersion: string
  mapping: {
    mappingHash: string
    proxyFingerprintHash: string
    proxyEndpoint: string
    launchProxyServer: string
    verifiedEgressIp: string
    mappedNetworkArgs: string[]
  }
  routing: {
    proxyRequestHits: number
    proxyConnectHits: number
    targetRequestHits: number
    fixtureLoadedThroughProxy: boolean
    proxyAuthorizationObserved: boolean
  }
  identity: Record<string, unknown>
  probe: NetworkProbe | null
  checks: {
    networkIdentityBound: boolean
    credentialRedactionPassed: boolean
    runtimeProxyPassed: boolean
    localeTimezonePassed: boolean
    geolocationPassed: boolean
    webrtcHostLeakAbsent: boolean
    verifiedWebRtcIpObserved: boolean
    legacyInjectionAbsent: boolean
  }
  retainedRoot: string
  failures: string[]
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Server did not expose a TCP port.'))
        return
      }
      resolve(address.port)
    })
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
    server.closeAllConnections?.()
  })
}

function forwardFixtureRequest(
  request: IncomingMessage,
  response: ServerResponse,
  targetPort: number,
): void {
  let parsed: URL
  try {
    parsed = new URL(request.url || '')
  } catch {
    response.writeHead(400).end('invalid proxy request URL')
    return
  }
  if (parsed.hostname !== FIXTURE_HOST) {
    response.writeHead(502).end('external destinations are disabled in this smoke test')
    return
  }
  const forwardedHeaders = {
    ...request.headers,
    host: `127.0.0.1:${targetPort}`,
  }
  delete forwardedHeaders['proxy-authorization']
  delete forwardedHeaders['proxy-connection']
  const forwarded = http.request(
    {
      host: '127.0.0.1',
      port: targetPort,
      method: request.method,
      path: `${parsed.pathname}${parsed.search}`,
      headers: forwardedHeaders,
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers)
      upstreamResponse.pipe(response)
    },
  )
  forwarded.on('error', (error) => {
    if (!response.headersSent) {
      response.writeHead(502)
    }
    response.end(`fixture forwarding failed: ${error.message}`)
  })
  request.pipe(forwarded)
}

function localHostAddresses(): string[] {
  const addresses = new Set<string>()
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const entry of interfaces ?? []) {
      if (!entry.internal) {
        addresses.add(entry.address.toLowerCase())
      }
    }
  }
  return Array.from(addresses)
}

async function evaluateNetworkProbe(page: CloakBrowserPageLike): Promise<NetworkProbe> {
  if (!page.evaluate) {
    throw new Error('Cloak page does not expose evaluate().')
  }
  return page.evaluate(async () => {
    const geolocationResult = await new Promise<{
      value: NetworkProbe['geolocation']
      error: string
    }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            value: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
            error: '',
          }),
        (error) => resolve({ value: null, error: error.message }),
        { enableHighAccuracy: false, timeout: 5_000 },
      )
    })

    const iceCandidates = await new Promise<string[]>((resolve) => {
      if (typeof RTCPeerConnection === 'undefined') {
        resolve([])
        return
      }
      const candidates: string[] = []
      const connection = new RTCPeerConnection({ iceServers: [] })
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        connection.close()
        resolve(candidates)
      }
      connection.onicecandidate = (event) => {
        if (event.candidate?.candidate) {
          candidates.push(event.candidate.candidate)
        } else {
          finish()
        }
      }
      connection.createDataChannel('phase3-network-probe')
      void connection
        .createOffer()
        .then((offer) => connection.setLocalDescription(offer))
        .catch(() => finish())
      setTimeout(finish, 4_000)
    })

    const candidateAddresses = iceCandidates
      .map((candidate) => candidate.split(/\s+/)[4] || '')
      .filter(Boolean)

    return {
      bodyText: document.body.textContent?.trim() || '',
      language: navigator.language,
      languages: Array.from(navigator.languages),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      webdriver: navigator.webdriver ?? null,
      geolocation: geolocationResult.value,
      geolocationError: geolocationResult.error,
      iceCandidates,
      candidateAddresses,
    }
  }) as Promise<NetworkProbe>
}

function buildProxySettings(proxyPort: number): ProfileProxySettings {
  return {
    proxyMode: 'custom',
    ipLookupChannel: 'ipwho.is',
    proxyType: 'http',
    ipProtocol: 'ipv4',
    host: 'upstream-fixture.invalid',
    port: proxyPort,
    username: SENTINEL_USERNAME,
    password: SENTINEL_PASSWORD,
    udpEnabled: false,
  }
}

function buildProxyRecord(proxyPort: number, now: string): ProxyRecord {
  return {
    id: 'phase3-local-proxy-fixture',
    name: 'Phase 3 local proxy fixture',
    type: 'http',
    host: 'upstream-fixture.invalid',
    port: proxyPort,
    username: SENTINEL_USERNAME,
    password: SENTINEL_PASSWORD,
    status: 'online',
    lastCheckedAt: now,
    createdAt: now,
    updatedAt: now,
  }
}

async function run(): Promise<NetworkSmokeReport> {
  const startedAt = new Date().toISOString()
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-network-'))
  const profileDir = path.join(root, 'profile')
  const downloadsDir = path.join(root, 'downloads')
  const cacheDir = process.env.DUOKAI_CLOAK_POC_CACHE_DIR || path.join(root, 'cloak-cache')
  for (const directory of [profileDir, downloadsDir, cacheDir]) {
    mkdirSync(directory, { recursive: true })
  }

  let targetRequestHits = 0
  let proxyRequestHits = 0
  let proxyConnectHits = 0
  let proxyAuthorizationObserved = false
  const targetServer = http.createServer((_request, response) => {
    targetRequestHits += 1
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end('<!doctype html><html><body>PHASE3_NETWORK_PROXY_OK</body></html>')
  })
  const targetPort = await listen(targetServer)
  const proxyServer = http.createServer((request, response) => {
    proxyRequestHits += 1
    proxyAuthorizationObserved ||= Boolean(request.headers['proxy-authorization'])
    forwardFixtureRequest(request, response, targetPort)
  })
  proxyServer.on('connect', (_request, socket) => {
    proxyConnectHits += 1
    socket.end('HTTP/1.1 502 External CONNECT disabled\r\n\r\n')
  })
  const proxyPort = await listen(proxyServer)

  const now = new Date()
  const checkedAt = now.toISOString()
  const mapping: CloakNetworkMapping = buildCloakNetworkMapping({
    profileId: 'phase3-network-smoke-profile',
    proxySettings: buildProxySettings(proxyPort),
    webrtcMode: 'proxy-aware',
    proxy: buildProxyRecord(proxyPort, checkedAt),
    egress: {
      ok: true,
      source: 'proxy',
      ip: VERIFIED_EGRESS_IP,
      country: 'United States',
      region: 'California',
      city: 'Los Angeles',
      timezone: 'America/Los_Angeles',
      language: 'en-US',
      geolocation: '34.0522, -118.2437',
      egressPathType: 'direct',
      checkedAt,
    },
    transport: {
      config: {
        server: `http://127.0.0.1:${proxyPort}`,
        bypass: '<-loopback>',
      },
      bridgeActive: true,
      egressPathType: 'direct',
      detail: 'Phase 3 loopback HTTP fixture bridge',
    },
    now,
  })

  const baseRequest: CloakRuntimeLaunchRequest = {
    userDataDir: profileDir,
    downloadsDir,
    cacheDir,
    locale: mapping.egress.language,
    timezoneId: mapping.egress.timezone,
    geolocation: mapping.geolocation
      ? {
          latitude: mapping.geolocation.latitude,
          longitude: mapping.geolocation.longitude,
          accuracy: 20,
        }
      : undefined,
    fingerprintSeed: 314159265,
    browserVersion: BROWSER_VERSION,
    viewport: null,
    deviceMode: 'desktop',
    permissions: ['geolocation'],
    extraArgs: [
      `--unsafely-treat-insecure-origin-as-secure=http://${FIXTURE_HOST}`,
    ],
    mappedFingerprintArgs: [
      '--fingerprint-platform=macos',
      '--fingerprint-hardware-concurrency=8',
      '--fingerprint-device-memory=8',
      '--fingerprint-screen-width=1440',
      '--fingerprint-screen-height=900',
      '--fingerprint-brand=Chrome',
      '--fingerprint-brand-version=145.0.7632.109',
      '--fingerprint-platform-version=15.5.0',
      '--fingerprint-location=34.0522,-118.2437',
    ],
  }
  const request = applyCloakNetworkMappingToLaunchRequest(baseRequest, mapping)
  const report: NetworkSmokeReport = {
    success: false,
    startedAt,
    finishedAt: '',
    browserVersion: BROWSER_VERSION,
    mapping: {
      mappingHash: mapping.mappingHash,
      proxyFingerprintHash: mapping.proxyFingerprintHash,
      proxyEndpoint: mapping.proxyEndpoint,
      launchProxyServer: mapping.launchProxy?.server || '',
      verifiedEgressIp: mapping.verifiedWebRtcIp,
      mappedNetworkArgs: mapping.mappedNetworkArgs,
    },
    routing: {
      proxyRequestHits: 0,
      proxyConnectHits: 0,
      targetRequestHits: 0,
      fixtureLoadedThroughProxy: false,
      proxyAuthorizationObserved: false,
    },
    identity: {},
    probe: null,
    checks: {
      networkIdentityBound: false,
      credentialRedactionPassed: false,
      runtimeProxyPassed: false,
      localeTimezonePassed: false,
      geolocationPassed: false,
      webrtcHostLeakAbsent: false,
      verifiedWebRtcIpObserved: false,
      legacyInjectionAbsent: false,
    },
    retainedRoot: '',
    failures: [],
  }

  let context: CloakBrowserContextLike | null = null
  try {
    const launched = await launchCloakPersistentContext(request)
    context = launched.context
    report.identity = launched.identity as unknown as Record<string, unknown>
    const page = context.pages()[0] ?? (await context.newPage())
    if (!page.goto) {
      throw new Error('Cloak page does not expose goto().')
    }
    await page.goto(`http://${FIXTURE_HOST}/probe`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    report.probe = await evaluateNetworkProbe(page)

    const serializedMapping = JSON.stringify(mapping)
    const localAddresses = localHostAddresses()
    const candidateText = report.probe.iceCandidates.join('\n').toLowerCase()
    report.routing = {
      proxyRequestHits,
      proxyConnectHits,
      targetRequestHits,
      fixtureLoadedThroughProxy:
        report.probe.bodyText.includes('PHASE3_NETWORK_PROXY_OK') &&
        proxyRequestHits > 0 &&
        targetRequestHits > 0,
      proxyAuthorizationObserved,
    }
    report.checks.networkIdentityBound =
      mapping.verifiedWebRtcIp === VERIFIED_EGRESS_IP &&
      mapping.egress.source === 'proxy' &&
      mapping.launchProxy?.server === `http://127.0.0.1:${proxyPort}`
    report.checks.credentialRedactionPassed =
      !serializedMapping.includes(SENTINEL_USERNAME) &&
      !serializedMapping.includes(SENTINEL_PASSWORD) &&
      !proxyAuthorizationObserved
    report.checks.runtimeProxyPassed = report.routing.fixtureLoadedThroughProxy
    report.checks.localeTimezonePassed =
      report.probe.language === 'en-US' &&
      report.probe.languages[0] === 'en-US' &&
      report.probe.timezone === 'America/Los_Angeles'
    report.checks.geolocationPassed = Boolean(
      report.probe.geolocation &&
        Math.abs(report.probe.geolocation.latitude - 34.0522) < 0.0001 &&
        Math.abs(report.probe.geolocation.longitude - -118.2437) < 0.0001,
    )
    report.checks.webrtcHostLeakAbsent = localAddresses.every(
      (address) => !candidateText.includes(address.toLowerCase()),
    )
    report.checks.verifiedWebRtcIpObserved = candidateText.includes(
      VERIFIED_EGRESS_IP.toLowerCase(),
    )
    const injectedWindow = globalThis as typeof globalThis & {
      __BITBROWSER_CLONE_INJECTED__?: unknown
    }
    report.checks.legacyInjectionAbsent =
      (await page.evaluate(
        () =>
          (globalThis as typeof globalThis & {
            __BITBROWSER_CLONE_INJECTED__?: unknown
          }).__BITBROWSER_CLONE_INJECTED__ === undefined,
      )) === true && injectedWindow.__BITBROWSER_CLONE_INJECTED__ === undefined

    for (const [name, passed] of Object.entries(report.checks)) {
      if (name === 'verifiedWebRtcIpObserved') continue
      if (!passed) {
        report.failures.push(`${name} did not pass.`)
      }
    }
    report.success = report.failures.length === 0
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : String(error))
  } finally {
    await closeCloakContextSafely(context)
    await Promise.all([closeServer(proxyServer), closeServer(targetServer)])
    report.finishedAt = new Date().toISOString()
    if (process.env.DUOKAI_CLOAK_POC_KEEP_PROFILE === '1') {
      report.retainedRoot = root
    } else {
      await rm(root, { recursive: true, force: true })
    }
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (!report.success) {
    process.exitCode = 1
  }
  return report
}

void run()
