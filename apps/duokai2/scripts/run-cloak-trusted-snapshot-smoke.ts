import http, { type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'

import type {
  FingerprintConfig,
  ProfileProxySettings,
} from '../src/shared/types.ts'
import {
  applyCloakFingerprintMappingToLaunchRequest,
  buildCloakFingerprintMapping,
} from '../electron/services/cloakBrowserFingerprint.ts'
import {
  applyCloakNetworkMappingToLaunchRequest,
  buildCloakNetworkMapping,
} from '../electron/services/cloakBrowserNetwork.ts'
import {
  closeCloakContextSafely,
  launchCloakPersistentContext,
  type CloakBrowserContextLike,
  type CloakBrowserPageLike,
  type CloakRuntimeLaunchRequest,
} from '../electron/services/cloakBrowserRuntime.ts'
import {
  buildCloakTrustedIdentitySnapshot,
  CloakTrustedSnapshotError,
  evaluateCloakTrustedIdentitySnapshotReuse,
  readCloakTrustedIdentitySnapshot,
  writeCloakTrustedIdentitySnapshotAtomic,
  type CloakTrustedLaunchEvidence,
} from '../electron/services/cloakBrowserTrustedSnapshot.ts'

const PROFILE_ID = 'phase4-trusted-snapshot-smoke-profile'
const BROWSER_VERSION = '145.0.7632.109.2'
const VERIFIED_EGRESS_IP = '203.0.113.25'

interface SnapshotProbe {
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
  legacyInjectionPresent: boolean
}

interface TrustedSnapshotSmokeReport {
  success: boolean
  startedAt: string
  finishedAt: string
  browserVersion: string
  identity: Record<string, unknown>
  mapping: {
    fingerprintMappingHash: string
    networkMappingHash: string
    proxyFingerprintHash: string
    verifiedEgressIp: string
  }
  snapshot: {
    snapshotId: string
    snapshotHash: string
    transportClass: string
    atomicWritePassed: boolean
    readBackPassed: boolean
    reusePassed: boolean
    tamperDetectionPassed: boolean
    credentialRedactionPassed: boolean
    leftoverTemporaryFiles: string[]
  }
  probe: SnapshotProbe | null
  evidence: CloakTrustedLaunchEvidence | null
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
        reject(new Error('Local snapshot fixture did not expose a TCP port.'))
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

function buildFingerprintConfig(): FingerprintConfig {
  return {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
    language: 'en-US',
    timezone: 'America/Los_Angeles',
    resolution: '1440x900',
    webrtcMode: 'proxy-aware',
    basicSettings: {} as FingerprintConfig['basicSettings'],
    proxySettings: {
      proxyMode: 'direct',
    } as FingerprintConfig['proxySettings'],
    commonSettings: {
      randomizeFingerprintOnLaunch: false,
    } as FingerprintConfig['commonSettings'],
    advanced: {
      browserKernel: 'chrome',
      browserKernelVersion: '145',
      deviceMode: 'desktop',
      operatingSystem: 'macOS',
      operatingSystemVersion: '15.5.0',
      browserVersion: '145',
      autoLanguageFromIp: true,
      autoInterfaceLanguageFromIp: true,
      interfaceLanguage: 'en-US',
      autoTimezoneFromIp: true,
      autoGeolocationFromIp: true,
      geolocationPermission: 'allow',
      geolocation: '',
      windowWidth: 1440,
      windowHeight: 900,
      fontMode: 'system',
      canvasMode: 'custom',
      webglImageMode: 'custom',
      webglMetadataMode: 'custom',
      webglVendor: 'Apple Inc.',
      webglRenderer: 'Apple M4 Pro',
      audioContextMode: 'custom',
      mediaDevicesMode: 'custom',
      speechVoicesMode: 'custom',
      doNotTrackEnabled: false,
      clientRectsMode: 'custom',
      deviceInfoMode: 'custom',
      deviceName: '',
      hostIp: '',
      macAddress: '',
      cpuCores: 8,
      memoryGb: 8,
    } as FingerprintConfig['advanced'],
    runtimeMetadata: {
      hardwareSeed: 'phase4-real-smoke-stable-seed',
      hardwareProfileId: 'phase4-real-smoke-hardware',
    } as FingerprintConfig['runtimeMetadata'],
  }
}

function buildDirectProxySettings(): ProfileProxySettings {
  return {
    proxyMode: 'direct',
    ipLookupChannel: 'ipwho.is',
    proxyType: 'http',
    ipProtocol: 'ipv4',
    host: '',
    port: 0,
    username: '',
    password: '',
    udpEnabled: false,
  }
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
  return [...addresses]
}

async function evaluateProbe(page: CloakBrowserPageLike): Promise<SnapshotProbe> {
  if (!page.evaluate) {
    throw new Error('Cloak page does not expose evaluate().')
  }
  return page.evaluate(async () => {
    const geolocationResult = await new Promise<{
      value: SnapshotProbe['geolocation']
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
      connection.createDataChannel('phase4-trusted-snapshot-probe')
      void connection
        .createOffer()
        .then((offer) => connection.setLocalDescription(offer))
        .catch(() => finish())
      setTimeout(finish, 4_000)
    })

    return {
      bodyText: document.body.textContent?.trim() || '',
      language: navigator.language,
      languages: Array.from(navigator.languages),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      webdriver: navigator.webdriver ?? null,
      geolocation: geolocationResult.value,
      geolocationError: geolocationResult.error,
      iceCandidates,
      candidateAddresses: iceCandidates
        .map((candidate) => candidate.split(/\s+/)[4] || '')
        .filter(Boolean),
      legacyInjectionPresent:
        (globalThis as typeof globalThis & {
          __BITBROWSER_CLONE_INJECTED__?: unknown
        }).__BITBROWSER_CLONE_INJECTED__ !== undefined,
    }
  }) as Promise<SnapshotProbe>
}

async function run(): Promise<TrustedSnapshotSmokeReport> {
  const startedAt = new Date().toISOString()
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-trusted-snapshot-'))
  const profileDir = path.join(root, 'profile')
  const downloadsDir = path.join(root, 'downloads')
  const snapshotDir = path.join(root, 'snapshot')
  const snapshotPath = path.join(snapshotDir, 'trusted-identity.json')
  const tamperedPath = path.join(snapshotDir, 'tampered-identity.json')
  const cacheDir = process.env.DUOKAI_CLOAK_POC_CACHE_DIR || path.join(root, 'cloak-cache')
  for (const directory of [profileDir, downloadsDir, snapshotDir, cacheDir]) {
    mkdirSync(directory, { recursive: true })
  }

  let targetHits = 0
  const targetServer = http.createServer((_request, response) => {
    targetHits += 1
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end('<!doctype html><html><body>PHASE4_TRUSTED_SNAPSHOT_OK</body></html>')
  })
  const targetPort = await listen(targetServer)
  const fixtureUrl = `http://127.0.0.1:${targetPort}/probe`

  const checkedAt = new Date()
  const fingerprintMapping = buildCloakFingerprintMapping({
    profileId: PROFILE_ID,
    fingerprintConfig: buildFingerprintConfig(),
    browserVersion: BROWSER_VERSION,
    resolvedLocale: 'en-US',
    resolvedTimezone: 'America/Los_Angeles',
    resolvedGeolocation: {
      latitude: 34.0522,
      longitude: -118.2437,
      accuracy: 20,
    },
    verifiedWebRtcIp: VERIFIED_EGRESS_IP,
  })
  const networkMapping = buildCloakNetworkMapping({
    profileId: PROFILE_ID,
    proxySettings: buildDirectProxySettings(),
    webrtcMode: 'proxy-aware',
    proxy: null,
    egress: {
      ok: true,
      source: 'local',
      ip: VERIFIED_EGRESS_IP,
      country: 'United States',
      region: 'California',
      city: 'Los Angeles',
      timezone: 'America/Los_Angeles',
      language: 'en-US',
      geolocation: '34.0522, -118.2437',
      egressPathType: 'direct',
      checkedAt: checkedAt.toISOString(),
    },
    transport: {
      config: null,
      bridgeActive: false,
      egressPathType: 'direct',
      detail: 'Phase 4 direct local fixture path',
    },
    now: checkedAt,
  })

  const baseRequest: CloakRuntimeLaunchRequest = {
    userDataDir: profileDir,
    downloadsDir,
    cacheDir,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    fingerprintSeed: 1,
    browserVersion: BROWSER_VERSION,
    viewport: null,
    deviceMode: 'desktop',
    permissions: ['geolocation'],
    extraArgs: [],
    mappedFingerprintArgs: [],
  }
  const request = applyCloakNetworkMappingToLaunchRequest(
    applyCloakFingerprintMappingToLaunchRequest(baseRequest, fingerprintMapping),
    networkMapping,
  )

  const report: TrustedSnapshotSmokeReport = {
    success: false,
    startedAt,
    finishedAt: '',
    browserVersion: BROWSER_VERSION,
    identity: {},
    mapping: {
      fingerprintMappingHash: fingerprintMapping.mappingHash,
      networkMappingHash: networkMapping.mappingHash,
      proxyFingerprintHash: networkMapping.proxyFingerprintHash,
      verifiedEgressIp: networkMapping.verifiedWebRtcIp,
    },
    snapshot: {
      snapshotId: '',
      snapshotHash: '',
      transportClass: '',
      atomicWritePassed: false,
      readBackPassed: false,
      reusePassed: false,
      tamperDetectionPassed: false,
      credentialRedactionPassed: false,
      leftoverTemporaryFiles: [],
    },
    probe: null,
    evidence: null,
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
    await page.goto(fixtureUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    report.probe = await evaluateProbe(page)

    const localAddresses = localHostAddresses()
    const candidateText = report.probe.iceCandidates.join('\n').toLowerCase()
    const verifiedWebRtcIpObserved = candidateText.includes(VERIFIED_EGRESS_IP.toLowerCase())
    const webRtcHostLeakAbsent = localAddresses.every(
      (address) => !candidateText.includes(address),
    )
    const candidateObservation = verifiedWebRtcIpObserved
      ? 'verified-ip-observed'
      : report.probe.iceCandidates.length === 0
        ? 'no-candidates'
        : 'not-required'
    const candidateReplacementAcceptable =
      verifiedWebRtcIpObserved || report.probe.iceCandidates.length === 0

    const evidence: CloakTrustedLaunchEvidence = {
      runtimeIdentityPassed: true,
      persistentContextPassed: true,
      startupNavigationPassed:
        report.probe.bodyText.includes('PHASE4_TRUSTED_SNAPSHOT_OK') && targetHits > 0,
      networkRoutePassed: targetHits > 0,
      credentialRedactionPassed: true,
      localeTimezonePassed:
        report.probe.language === 'en-US' &&
        report.probe.languages[0] === 'en-US' &&
        report.probe.timezone === 'America/Los_Angeles',
      geolocationPassed: Boolean(
        report.probe.geolocation &&
          Math.abs(report.probe.geolocation.latitude - 34.0522) < 0.0001 &&
          Math.abs(report.probe.geolocation.longitude - -118.2437) < 0.0001,
      ),
      webRtcHostLeakAbsent,
      verifiedWebRtcIpObserved,
      webRtcCandidateObservation: candidateObservation,
      legacyInjectionAbsent: !report.probe.legacyInjectionPresent,
    }
    report.evidence = evidence
    if (!candidateReplacementAcceptable) {
      report.failures.push(
        'WebRTC produced candidates but the verified replacement IP was not observed.',
      )
    }

    const snapshot = buildCloakTrustedIdentitySnapshot({
      profileId: PROFILE_ID,
      desktopAppVersion: '3.6.8',
      hostEnvironment: `${process.platform}-${process.arch}`,
      runtimeIdentity: launched.identity,
      fingerprintMapping,
      networkMapping,
      evidence,
    })
    await writeCloakTrustedIdentitySnapshotAtomic(snapshotPath, snapshot)
    report.snapshot.atomicWritePassed = true
    const readBack = await readCloakTrustedIdentitySnapshot(snapshotPath)
    report.snapshot.readBackPassed = readBack.snapshotHash === snapshot.snapshotHash
    report.snapshot.snapshotId = readBack.snapshotId
    report.snapshot.snapshotHash = readBack.snapshotHash
    report.snapshot.transportClass = readBack.networkMapping.transportClass
    const serializedSnapshot = JSON.stringify(readBack)
    report.snapshot.credentialRedactionPassed =
      !serializedSnapshot.includes('"username"') &&
      !serializedSnapshot.includes('"password"') &&
      !serializedSnapshot.includes('"launchProxy"')

    const reuseDecision = evaluateCloakTrustedIdentitySnapshotReuse(readBack, {
      profileId: PROFILE_ID,
      desktopAppVersion: '3.6.8',
      hostEnvironment: `${process.platform}-${process.arch}`,
      runtimeIdentity: launched.identity,
      fingerprintMapping,
      networkMapping,
      now: new Date(),
    })
    report.snapshot.reusePassed = reuseDecision.usable
    if (!reuseDecision.usable) {
      report.failures.push(`Exact snapshot reuse failed: ${reuseDecision.reason}`)
    }

    const tampered = structuredClone(readBack)
    tampered.runtimeIdentity.binarySha256 = '0'.repeat(64)
    await writeFile(tamperedPath, JSON.stringify(tampered), 'utf8')
    try {
      await readCloakTrustedIdentitySnapshot(tamperedPath)
    } catch (error) {
      report.snapshot.tamperDetectionPassed =
        error instanceof CloakTrustedSnapshotError &&
        error.code === 'snapshot_hash_mismatch'
    }

    report.snapshot.leftoverTemporaryFiles = (await readdir(snapshotDir)).filter((name) =>
      name.endsWith('.tmp'),
    )

    for (const [name, passed] of Object.entries(evidence)) {
      if (name === 'verifiedWebRtcIpObserved' || name === 'webRtcCandidateObservation') continue
      if (!passed) {
        report.failures.push(`${name} did not pass.`)
      }
    }
    for (const [name, passed] of Object.entries(report.snapshot)) {
      if (name === 'snapshotId' || name === 'snapshotHash' || name === 'transportClass' || name === 'leftoverTemporaryFiles') {
        continue
      }
      if (!passed) {
        report.failures.push(`${name} did not pass.`)
      }
    }
    if (report.snapshot.leftoverTemporaryFiles.length > 0) {
      report.failures.push('Atomic snapshot write left temporary files behind.')
    }
    report.success = report.failures.length === 0
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : String(error))
  } finally {
    await closeCloakContextSafely(context)
    await closeServer(targetServer)
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
