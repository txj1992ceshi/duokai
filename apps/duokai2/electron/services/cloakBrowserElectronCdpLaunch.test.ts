import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, stat, writeFile, chmod } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  configureElectronCdpFromLaunchRequest,
  createElectronCdpLaunchRequest,
  getElectronCdpLaunchReceiptPath,
  restoreCloakFailClosedAfterElectronCdpFailure,
  updateElectronCdpLaunchReceipt,
  waitForElectronCdpEndpoint,
  writeElectronCdpLaunchRequestAtomic,
} from './cloakBrowserElectronCdpLaunch.ts'
import {
  CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
  getCloakPilotLocalConfigPath,
  readCloakPilotLocalConfig,
  writeCloakPilotLocalConfigAtomic,
} from './cloakBrowserPilotConfig.ts'
import {
  CLOAK_ROLLOUT_HEALTH_SCHEMA_VERSION,
  createDefaultCloakRolloutControl,
  getCloakRolloutControlPath,
  getCloakRolloutHealthPath,
  readCloakRolloutControl,
  readCloakRolloutHealth,
  writeCloakRolloutControlAtomic,
  writeCloakRolloutHealthAtomic,
} from './cloakBrowserRolloutControl.ts'

const fixedNow = new Date('2026-07-28T16:40:00.000Z')
const executablePath = '/Applications/Test Duokai.app/Contents/MacOS/Duokai'
const appAsarContent = 'phase-6j-app-asar-fixture'
const appAsarSha256 = 'c3e6633f8aae34eb7538d38b46e67d80785f2a455b584f2fd37ec11d696a141b'

async function fixture(): Promise<{
  root: string
  userDataDir: string
  resourcesPath: string
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-phase6j-cdp-'))
  const userDataDir = path.join(root, 'user-data')
  const resourcesPath = path.join(root, 'resources')
  await mkdir(userDataDir, { recursive: true, mode: 0o700 })
  await mkdir(resourcesPath, { recursive: true, mode: 0o700 })
  await writeFile(path.join(resourcesPath, 'app.asar'), appAsarContent, { mode: 0o600 })
  return { root, userDataDir, resourcesPath }
}

function request(overrides: Partial<Parameters<typeof createElectronCdpLaunchRequest>[0]> = {}) {
  return createElectronCdpLaunchRequest({
    nonce: '12345678-1234-4234-8234-1234567890ab',
    now: fixedNow,
    ttlMs: 90_000,
    debuggingPort: 54_266,
    readinessTimeoutMs: 30_000,
    expectedExecutablePath: executablePath,
    expectedAppAsarSha256: appAsarSha256,
    rolloutId: 'phase6k-test-rollout',
    batchId: 'single-profile-phase6k',
    profileId: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  })
}

test('no launch request leaves Electron CDP disabled', async () => {
  const { userDataDir, resourcesPath } = await fixture()
  const switches: Array<[string, string | undefined]> = []
  const result = configureElectronCdpFromLaunchRequest({
    userDataDir,
    resourcesPath,
    expectedExecutablePath: executablePath,
    isPackaged: true,
    processId: 41001,
    now: fixedNow,
    commandLine: { appendSwitch: (name, value) => switches.push([name, value]) },
  })
  assert.equal(result.kind, 'none')
  assert.deepEqual(switches, [])
})

test('valid private request is consumed, binds loopback CDP, and records exact PID evidence', async () => {
  const { userDataDir, resourcesPath } = await fixture()
  const launchRequest = request()
  const requestPath = writeElectronCdpLaunchRequestAtomic(userDataDir, launchRequest)
  const mode = (await stat(requestPath)).mode & 0o777
  if (process.platform !== 'win32') assert.equal(mode, 0o600)

  const switches: Array<[string, string | undefined]> = []
  const physicalArchiveReads: string[] = []
  const result = configureElectronCdpFromLaunchRequest({
    userDataDir,
    resourcesPath,
    expectedExecutablePath: executablePath,
    isPackaged: true,
    readAppAsarFile: (filePath) => {
      physicalArchiveReads.push(filePath)
      return Buffer.from(appAsarContent)
    },
    processId: 41002,
    now: fixedNow,
    commandLine: { appendSwitch: (name, value) => switches.push([name, value]) },
  })

  assert.equal(result.kind, 'configured')
  assert.deepEqual(switches, [
    ['remote-debugging-address', '127.0.0.1'],
    ['remote-debugging-port', '54266'],
  ])
  assert.deepEqual(physicalArchiveReads, [path.join(resourcesPath, 'app.asar')])
  await assert.rejects(readFile(requestPath, 'utf8'), { code: 'ENOENT' })
  const receiptPath = getElectronCdpLaunchReceiptPath(userDataDir, launchRequest.nonce)
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'))
  assert.equal(receipt.status, 'configured')
  assert.equal(receipt.pid, 41002)
  assert.equal(receipt.processExecPath, executablePath)
  assert.equal(receipt.appAsarSha256, appAsarSha256)
  assert.equal(receipt.debuggingAddress, '127.0.0.1')
  assert.equal(receipt.debuggingPort, 54_266)
})

test('request bound to a different executable is rejected and never enables CDP', async () => {
  const { userDataDir, resourcesPath } = await fixture()
  const launchRequest = request({ expectedExecutablePath: '/tmp/not-duokai' })
  writeElectronCdpLaunchRequestAtomic(userDataDir, launchRequest)
  const switches: Array<[string, string | undefined]> = []

  const result = configureElectronCdpFromLaunchRequest({
    userDataDir,
    resourcesPath,
    expectedExecutablePath: executablePath,
    isPackaged: true,
    processId: 41003,
    now: fixedNow,
    commandLine: { appendSwitch: (name, value) => switches.push([name, value]) },
  })

  assert.equal(result.kind, 'rejected')
  assert.match(result.reason, /executable path/i)
  assert.deepEqual(switches, [])
  const receipt = JSON.parse(await readFile(result.receiptPath, 'utf8'))
  assert.equal(receipt.status, 'rejected')
})

test('expired or non-private request is rejected and removed', async () => {
  const { userDataDir, resourcesPath } = await fixture()
  const launchRequest = request({ ttlMs: 5_000 })
  const requestPath = writeElectronCdpLaunchRequestAtomic(userDataDir, launchRequest)
  if (process.platform !== 'win32') await chmod(requestPath, 0o644)

  const result = configureElectronCdpFromLaunchRequest({
    userDataDir,
    resourcesPath,
    expectedExecutablePath: executablePath,
    isPackaged: true,
    processId: 41004,
    now: new Date(fixedNow.getTime() + 10_000),
    commandLine: { appendSwitch: () => assert.fail('CDP switch must not be enabled') },
  })

  assert.equal(result.kind, 'rejected')
  if (process.platform !== 'win32') assert.match(result.reason, /private/i)
  else assert.match(result.reason, /expired/i)
  await assert.rejects(readFile(requestPath, 'utf8'), { code: 'ENOENT' })
})

test('CDP readiness tolerates transient failures and persists a ready receipt', async () => {
  const { userDataDir, resourcesPath } = await fixture()
  const launchRequest = request()
  writeElectronCdpLaunchRequestAtomic(userDataDir, launchRequest)
  const configured = configureElectronCdpFromLaunchRequest({
    userDataDir,
    resourcesPath,
    expectedExecutablePath: executablePath,
    isPackaged: true,
    processId: 41005,
    now: fixedNow,
    commandLine: { appendSwitch: () => {} },
  })
  assert.equal(configured.kind, 'configured')

  let clock = 0
  let probes = 0
  const readiness = await waitForElectronCdpEndpoint({
    debuggingAddress: '127.0.0.1',
    debuggingPort: 54_266,
    timeoutMs: 5_000,
    intervalMs: 250,
    now: () => clock,
    delay: async (ms) => {
      clock += ms
    },
    probe: async () => {
      probes += 1
      if (probes < 3) throw new Error('connection refused')
      return {
        Browser: 'Chrome/145.0.7632.109',
        webSocketDebuggerUrl: 'ws://127.0.0.1:54266/devtools/browser/test',
      }
    },
  })
  assert.equal(readiness.ready, true)
  assert.equal(readiness.attempts, 3)

  const receipt = updateElectronCdpLaunchReceipt(configured.receiptPath, {
    status: 'ready',
    now: fixedNow,
    readiness,
  })
  assert.equal(receipt.status, 'ready')
  assert.equal(receipt.endpointBrowser, 'Chrome/145.0.7632.109')
  assert.equal(receipt.readinessAttempts, 3)
})

test('CDP readiness returns a bounded failure result', async () => {
  let clock = 0
  const readiness = await waitForElectronCdpEndpoint({
    debuggingAddress: '127.0.0.1',
    debuggingPort: 54_266,
    timeoutMs: 1_000,
    intervalMs: 250,
    now: () => clock,
    delay: async (ms) => {
      clock += ms
    },
    probe: async () => {
      throw new Error('connection refused')
    },
  })
  assert.equal(readiness.ready, false)
  assert.equal(readiness.durationMs, 1_000)
  assert.match(readiness.lastError, /connection refused/)
})

test('CDP launch failure restores Pilot and rollout controls to fail-closed without erasing health', async () => {
  const { userDataDir } = await fixture()
  const pilotPath = getCloakPilotLocalConfigPath(userDataDir)
  const controlPath = getCloakRolloutControlPath(userDataDir)
  const healthPath = getCloakRolloutHealthPath(userDataDir)
  const control = createDefaultCloakRolloutControl()

  await writeCloakPilotLocalConfigAtomic(pilotPath, {
    schemaVersion: CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
    enabledProfileIds: ['11111111-1111-4111-8111-111111111111'],
    updatedAt: fixedNow.toISOString(),
  })
  await writeCloakRolloutControlAtomic(controlPath, {
    ...control,
    mode: 'observe',
    rolloutId: 'phase6k-test-rollout',
    globalKillSwitch: false,
    batches: [
      {
        id: 'single-profile-phase6k',
        enabled: true,
        killSwitch: false,
        profileIds: ['11111111-1111-4111-8111-111111111111'],
        maxConcurrentSessions: 1,
      },
    ],
    updatedAt: fixedNow.toISOString(),
  })
  await writeCloakRolloutHealthAtomic(healthPath, {
    schemaVersion: CLOAK_ROLLOUT_HEALTH_SCHEMA_VERSION,
    rolloutId: 'phase6k-test-rollout',
    outcomes: [
      {
        profileId: 'fixture-profile',
        batchId: 'fixture-batch',
        success: false,
        reason: 'fixture',
        at: fixedNow.toISOString(),
      },
    ],
    updatedAt: fixedNow.toISOString(),
  })

  const result = await restoreCloakFailClosedAfterElectronCdpFailure(
    userDataDir,
    new Date(fixedNow.getTime() + 1_000),
  )
  assert.deepEqual(result.pilotEnabledProfileIds, [])
  assert.equal(result.rolloutMode, 'off')
  assert.equal(result.rolloutGlobalKillSwitch, true)
  assert.equal(result.enabledBatchCount, 0)
  assert.equal(result.unguardedBatchCount, 0)
  assert.equal(result.healthOutcomeCount, 1)

  const pilot = await readCloakPilotLocalConfig(pilotPath)
  const rollout = await readCloakRolloutControl(controlPath)
  const health = await readCloakRolloutHealth(healthPath)
  assert.deepEqual(pilot.config.enabledProfileIds, [])
  assert.equal(rollout.config.mode, 'off')
  assert.equal(rollout.config.batches[0]?.enabled, false)
  assert.equal(rollout.config.batches[0]?.killSwitch, true)
  assert.equal(health.state.outcomes.length, 1)
})

test('main consumes the one-time request before app readiness and fail-closes every bootstrap failure path', async () => {
  const main = await readFile(path.resolve('electron/main.ts'), 'utf8')
  const viteConfig = await readFile(path.resolve('vite.config.ts'), 'utf8')
  const configureIndex = main.indexOf('configureElectronCdpFromLaunchRequest({')
  const readyIndex = main.indexOf('await app.whenReady()')
  const windowIndex = main.indexOf('await createMainWindow()')
  const readinessIndex = main.indexOf('await waitForElectronCdpEndpoint({')

  assert.ok(configureIndex >= 0)
  assert.ok(readyIndex > configureIndex)
  assert.ok(windowIndex > readyIndex)
  assert.ok(readinessIndex > windowIndex)
  assert.match(main, /node:original-fs/)
  assert.match(main, /readAppAsarFile: readOriginalFileSync/)
  assert.match(viteConfig, /external:\s*\[[^\]]*['"]node:original-fs['"]/s)
  assert.match(main, /electron_cdp_launch_request_rejected/)
  assert.match(main, /electron_cdp_launch_readiness_failed/)
  assert.match(main, /electron_cdp_launch_bootstrap_failed_closed/)
  assert.match(main, /app\.exit\(72\)/)
  assert.match(main, /app\.exit\(73\)/)
  assert.match(main, /app\.exit\(74\)/)
  assert.ok(
    main.split('restoreCloakFailClosedAfterElectronCdpFailure').length - 1 >= 4,
    'all request rejection, endpoint failure, and bootstrap failure paths must restore fail-closed controls',
  )
})
