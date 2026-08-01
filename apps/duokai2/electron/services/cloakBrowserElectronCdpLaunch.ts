import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {
  CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
  getCloakPilotLocalConfigPath,
  writeCloakPilotLocalConfigAtomic,
} from './cloakBrowserPilotConfig.ts'
import {
  createDefaultCloakRolloutControl,
  getCloakRolloutControlPath,
  getCloakRolloutHealthPath,
  readCloakRolloutControl,
  readCloakRolloutHealth,
  writeCloakRolloutControlAtomic,
} from './cloakBrowserRolloutControl.ts'

export const ELECTRON_CDP_LAUNCH_REQUEST_SCHEMA_VERSION = 1
export const ELECTRON_CDP_LAUNCH_RECEIPT_SCHEMA_VERSION = 1
export const ELECTRON_CDP_LAUNCH_REQUEST_FILE = 'electron-cdp-launch-request.json'
export const ELECTRON_CDP_LAUNCH_MAX_TTL_MS = 120_000
export const ELECTRON_CDP_LAUNCH_MIN_PORT = 49_152

export interface ElectronCdpLaunchRequest {
  schemaVersion: typeof ELECTRON_CDP_LAUNCH_REQUEST_SCHEMA_VERSION
  purpose: 'single-profile-observe'
  nonce: string
  createdAt: string
  expiresAt: string
  debuggingAddress: '127.0.0.1'
  debuggingPort: number
  readinessTimeoutMs: number
  expectedExecutablePath: string
  expectedAppAsarSha256: string
  rolloutId: string
  batchId: string
  profileId: string
  failClosedOnFailure: true
}

export type ElectronCdpLaunchReceiptStatus = 'configured' | 'ready' | 'failed' | 'rejected'

export interface ElectronCdpLaunchReceipt {
  schemaVersion: typeof ELECTRON_CDP_LAUNCH_RECEIPT_SCHEMA_VERSION
  status: ElectronCdpLaunchReceiptStatus
  nonce: string
  purpose: string
  pid: number
  recordedAt: string
  requestHash: string
  requestPath: string
  receiptPath: string
  processExecPath: string
  resourcesPath: string
  appAsarSha256: string
  debuggingAddress: string
  debuggingPort: number
  rolloutId: string
  batchId: string
  profileId: string
  reason: string
  endpointBrowser: string
  endpointWebSocketDebuggerUrl: string
  readinessAttempts: number
  readinessDurationMs: number
}

export interface ElectronCommandLineLike {
  appendSwitch(name: string, value?: string): void
}

export type ElectronCdpLaunchConfiguration =
  | { kind: 'none'; requestPath: string }
  | {
      kind: 'configured'
      request: ElectronCdpLaunchRequest
      requestHash: string
      requestPath: string
      receiptPath: string
    }
  | {
      kind: 'rejected'
      requestPath: string
      receiptPath: string
      reason: string
    }

export interface ElectronCdpEndpointReadiness {
  ready: boolean
  attempts: number
  durationMs: number
  browser: string
  webSocketDebuggerUrl: string
  lastError: string
}

export class ElectronCdpLaunchError extends Error {
  readonly code:
    | 'invalid_path'
    | 'invalid_permissions'
    | 'invalid_request'
    | 'request_io_failed'
    | 'receipt_io_failed'

  constructor(code: ElectronCdpLaunchError['code'], message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'ElectronCdpLaunchError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function canonicalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function fileHash(
  filePath: string,
  readPhysicalFile: (filePath: string) => Buffer = readFileSync,
): string {
  return createHash('sha256').update(readPhysicalFile(filePath)).digest('hex')
}

function assertAbsolutePath(filePath: string, label: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new ElectronCdpLaunchError('invalid_path', `${label} must be absolute.`)
  }
  return path.resolve(filePath)
}

function assertPrivateFile(filePath: string): void {
  if (process.platform === 'win32') return
  const mode = statSync(filePath).mode & 0o777
  if ((mode & 0o077) !== 0) {
    throw new ElectronCdpLaunchError(
      'invalid_permissions',
      `Electron CDP launch request must be private; mode=${mode.toString(8)}.`,
    )
  }
}

function normalizeConcreteId(value: unknown, label: string): string {
  const result = String(value ?? '').trim()
  const hasControlCharacter = [...result].some((character) => character.charCodeAt(0) < 32)
  if (!result || result === '*' || hasControlCharacter) {
    throw new ElectronCdpLaunchError('invalid_request', `${label} must be a concrete identifier.`)
  }
  return result
}

function normalizeIsoDate(value: unknown, label: string): string {
  const result = String(value ?? '').trim()
  if (!result || !Number.isFinite(Date.parse(result))) {
    throw new ElectronCdpLaunchError('invalid_request', `${label} must be an ISO date.`)
  }
  return result
}

function normalizeSha256(value: unknown, label: string): string {
  const result = String(value ?? '').trim().toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(result)) {
    throw new ElectronCdpLaunchError('invalid_request', `${label} must be a SHA256 value.`)
  }
  return result
}

function normalizeRequest(
  value: unknown,
  expectedExecutablePath: string,
  actualAppAsarSha256: string,
  isPackaged: boolean,
  now: Date,
): ElectronCdpLaunchRequest {
  if (!isRecord(value)) {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP launch request must be an object.')
  }
  if (value.schemaVersion !== ELECTRON_CDP_LAUNCH_REQUEST_SCHEMA_VERSION) {
    throw new ElectronCdpLaunchError('invalid_request', 'Unsupported Electron CDP launch request schema.')
  }
  if (value.purpose !== 'single-profile-observe') {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP launch purpose is not authorized.')
  }
  if (value.failClosedOnFailure !== true) {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP launch must fail closed.')
  }
  if (!isPackaged) {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP launch request requires a packaged app.')
  }

  const nonce = String(value.nonce ?? '').trim().toLowerCase()
  if (!/^[a-f0-9-]{16,80}$/.test(nonce)) {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP launch nonce is invalid.')
  }
  const createdAt = normalizeIsoDate(value.createdAt, 'createdAt')
  const expiresAt = normalizeIsoDate(value.expiresAt, 'expiresAt')
  const createdMs = Date.parse(createdAt)
  const expiresMs = Date.parse(expiresAt)
  const nowMs = now.getTime()
  if (createdMs > nowMs + 5_000) {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP launch request is from the future.')
  }
  if (expiresMs <= nowMs) {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP launch request has expired.')
  }
  if (expiresMs <= createdMs || expiresMs - createdMs > ELECTRON_CDP_LAUNCH_MAX_TTL_MS) {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP launch request TTL is invalid.')
  }

  if (value.debuggingAddress !== '127.0.0.1') {
    throw new ElectronCdpLaunchError('invalid_request', 'Electron CDP must bind to 127.0.0.1.')
  }
  const debuggingPort = Number(value.debuggingPort)
  if (
    !Number.isInteger(debuggingPort) ||
    debuggingPort < ELECTRON_CDP_LAUNCH_MIN_PORT ||
    debuggingPort > 65_535
  ) {
    throw new ElectronCdpLaunchError(
      'invalid_request',
      `Electron CDP port must be between ${ELECTRON_CDP_LAUNCH_MIN_PORT} and 65535.`,
    )
  }
  const readinessTimeoutMs = Number(value.readinessTimeoutMs)
  if (
    !Number.isInteger(readinessTimeoutMs) ||
    readinessTimeoutMs < 5_000 ||
    readinessTimeoutMs > 60_000
  ) {
    throw new ElectronCdpLaunchError(
      'invalid_request',
      'Electron CDP readiness timeout must be between 5000 and 60000 ms.',
    )
  }

  const normalizedExpectedExecutablePath = assertAbsolutePath(
    String(value.expectedExecutablePath ?? ''),
    'Expected Electron executable path',
  )
  if (normalizedExpectedExecutablePath !== path.resolve(expectedExecutablePath)) {
    throw new ElectronCdpLaunchError(
      'invalid_request',
      'Electron executable path does not match the launch request.',
    )
  }
  const expectedAppAsarSha256 = normalizeSha256(
    value.expectedAppAsarSha256,
    'expectedAppAsarSha256',
  )
  if (expectedAppAsarSha256 !== actualAppAsarSha256.toLowerCase()) {
    throw new ElectronCdpLaunchError(
      'invalid_request',
      'Packaged app ASAR identity does not match the launch request.',
    )
  }

  return {
    schemaVersion: ELECTRON_CDP_LAUNCH_REQUEST_SCHEMA_VERSION,
    purpose: 'single-profile-observe',
    nonce,
    createdAt,
    expiresAt,
    debuggingAddress: '127.0.0.1',
    debuggingPort,
    readinessTimeoutMs,
    expectedExecutablePath: normalizedExpectedExecutablePath,
    expectedAppAsarSha256,
    rolloutId: normalizeConcreteId(value.rolloutId, 'rolloutId'),
    batchId: normalizeConcreteId(value.batchId, 'batchId'),
    profileId: normalizeConcreteId(value.profileId, 'profileId'),
    failClosedOnFailure: true,
  }
}

function writePrivateJsonAtomicSync(filePath: string, value: unknown): void {
  const resolvedPath = assertAbsolutePath(filePath, 'Private JSON path')
  const directory = path.dirname(resolvedPath)
  const temporaryPath = path.join(directory, `.${path.basename(resolvedPath)}.${randomUUID()}.tmp`)
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') chmodSync(directory, 0o700)
    writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    if (process.platform !== 'win32') chmodSync(temporaryPath, 0o600)
    const descriptor = openSync(temporaryPath, 'r+')
    try {
      fsyncSync(descriptor)
    } finally {
      closeSync(descriptor)
    }
    renameSync(temporaryPath, resolvedPath)
    if (process.platform !== 'win32') chmodSync(resolvedPath, 0o600)
  } catch (error) {
    rmSync(temporaryPath, { force: true })
    if (error instanceof ElectronCdpLaunchError) throw error
    throw new ElectronCdpLaunchError('receipt_io_failed', 'Unable to persist private JSON.', error)
  }
}

export function getElectronCdpLaunchRequestPath(userDataDir: string): string {
  const root = assertAbsolutePath(userDataDir, 'Electron userData directory')
  return path.join(root, 'cloak-pilot', ELECTRON_CDP_LAUNCH_REQUEST_FILE)
}

export function getElectronCdpLaunchReceiptPath(userDataDir: string, nonce: string): string {
  const root = assertAbsolutePath(userDataDir, 'Electron userData directory')
  const normalizedNonce = String(nonce).trim().toLowerCase()
  if (!/^[a-f0-9-]{16,80}$/.test(normalizedNonce)) {
    return path.join(root, 'cloak-pilot', 'electron-cdp-launch-rejection.json')
  }
  return path.join(root, 'cloak-pilot', `electron-cdp-launch-${normalizedNonce}.receipt.json`)
}

export function createElectronCdpLaunchRequest(input: {
  nonce?: string
  now?: Date
  ttlMs?: number
  debuggingPort: number
  readinessTimeoutMs?: number
  expectedExecutablePath: string
  expectedAppAsarSha256: string
  rolloutId: string
  batchId: string
  profileId: string
}): ElectronCdpLaunchRequest {
  const now = input.now ?? new Date()
  const ttlMs = input.ttlMs ?? 90_000
  const value: ElectronCdpLaunchRequest = {
    schemaVersion: ELECTRON_CDP_LAUNCH_REQUEST_SCHEMA_VERSION,
    purpose: 'single-profile-observe',
    nonce: (input.nonce ?? randomUUID()).toLowerCase(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
    debuggingAddress: '127.0.0.1',
    debuggingPort: input.debuggingPort,
    readinessTimeoutMs: input.readinessTimeoutMs ?? 30_000,
    expectedExecutablePath: path.resolve(input.expectedExecutablePath),
    expectedAppAsarSha256: input.expectedAppAsarSha256.toLowerCase(),
    rolloutId: input.rolloutId,
    batchId: input.batchId,
    profileId: input.profileId,
    failClosedOnFailure: true,
  }
  return normalizeRequest(
    value,
    value.expectedExecutablePath,
    value.expectedAppAsarSha256,
    true,
    now,
  )
}

export function writeElectronCdpLaunchRequestAtomic(
  userDataDir: string,
  request: ElectronCdpLaunchRequest,
): string {
  const requestPath = getElectronCdpLaunchRequestPath(userDataDir)
  writePrivateJsonAtomicSync(requestPath, request)
  return requestPath
}

function buildReceipt(input: {
  status: ElectronCdpLaunchReceiptStatus
  nonce: string
  purpose: string
  pid: number
  now: Date
  requestHash: string
  requestPath: string
  receiptPath: string
  processExecPath: string
  resourcesPath: string
  appAsarSha256: string
  debuggingAddress?: string
  debuggingPort?: number
  rolloutId?: string
  batchId?: string
  profileId?: string
  reason?: string
}): ElectronCdpLaunchReceipt {
  return {
    schemaVersion: ELECTRON_CDP_LAUNCH_RECEIPT_SCHEMA_VERSION,
    status: input.status,
    nonce: input.nonce,
    purpose: input.purpose,
    pid: input.pid,
    recordedAt: input.now.toISOString(),
    requestHash: input.requestHash,
    requestPath: input.requestPath,
    receiptPath: input.receiptPath,
    processExecPath: input.processExecPath,
    resourcesPath: input.resourcesPath,
    appAsarSha256: input.appAsarSha256,
    debuggingAddress: input.debuggingAddress ?? '',
    debuggingPort: input.debuggingPort ?? 0,
    rolloutId: input.rolloutId ?? '',
    batchId: input.batchId ?? '',
    profileId: input.profileId ?? '',
    reason: input.reason ?? '',
    endpointBrowser: '',
    endpointWebSocketDebuggerUrl: '',
    readinessAttempts: 0,
    readinessDurationMs: 0,
  }
}

export function configureElectronCdpFromLaunchRequest(input: {
  userDataDir: string
  commandLine: ElectronCommandLineLike
  expectedExecutablePath: string
  resourcesPath: string
  isPackaged: boolean
  readAppAsarFile?: (filePath: string) => Buffer
  processId?: number
  now?: Date
}): ElectronCdpLaunchConfiguration {
  const requestPath = getElectronCdpLaunchRequestPath(input.userDataDir)
  if (!existsSync(requestPath)) return { kind: 'none', requestPath }

  const now = input.now ?? new Date()
  const processId = input.processId ?? process.pid
  const consumedPath = `${requestPath}.consuming-${processId}-${randomUUID()}`
  let rawContent = ''
  let rawValue: unknown = null
  let nonce = ''
  let receiptPath = getElectronCdpLaunchReceiptPath(input.userDataDir, nonce)
  let appAsarSha256 = ''

  try {
    renameSync(requestPath, consumedPath)
    assertPrivateFile(consumedPath)
    rawContent = readFileSync(consumedPath, 'utf8')
    rawValue = JSON.parse(rawContent) as unknown
    nonce = isRecord(rawValue) ? String(rawValue.nonce ?? '').trim().toLowerCase() : ''
    receiptPath = getElectronCdpLaunchReceiptPath(input.userDataDir, nonce)
    const appAsarPath = path.join(assertAbsolutePath(input.resourcesPath, 'Electron resources path'), 'app.asar')
    if (!existsSync(appAsarPath)) {
      throw new ElectronCdpLaunchError('invalid_request', 'Packaged app.asar is unavailable.')
    }
    appAsarSha256 = fileHash(appAsarPath, input.readAppAsarFile)
    const request = normalizeRequest(
      rawValue,
      assertAbsolutePath(input.expectedExecutablePath, 'Electron executable path'),
      appAsarSha256,
      input.isPackaged,
      now,
    )
    input.commandLine.appendSwitch('remote-debugging-address', request.debuggingAddress)
    input.commandLine.appendSwitch('remote-debugging-port', String(request.debuggingPort))
    const requestHash = createHash('sha256').update(rawContent).digest('hex')
    const receipt = buildReceipt({
      status: 'configured',
      nonce: request.nonce,
      purpose: request.purpose,
      pid: processId,
      now,
      requestHash,
      requestPath,
      receiptPath,
      processExecPath: path.resolve(input.expectedExecutablePath),
      resourcesPath: path.resolve(input.resourcesPath),
      appAsarSha256,
      debuggingAddress: request.debuggingAddress,
      debuggingPort: request.debuggingPort,
      rolloutId: request.rolloutId,
      batchId: request.batchId,
      profileId: request.profileId,
    })
    writePrivateJsonAtomicSync(receiptPath, receipt)
    rmSync(consumedPath, { force: true })
    return { kind: 'configured', request, requestHash, requestPath, receiptPath }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    const requestHash = rawContent ? createHash('sha256').update(rawContent).digest('hex') : ''
    const rejection = buildReceipt({
      status: 'rejected',
      nonce,
      purpose: isRecord(rawValue) ? String(rawValue.purpose ?? '') : '',
      pid: processId,
      now,
      requestHash,
      requestPath,
      receiptPath,
      processExecPath: path.resolve(input.expectedExecutablePath),
      resourcesPath: path.resolve(input.resourcesPath),
      appAsarSha256,
      reason,
    })
    try {
      writePrivateJsonAtomicSync(receiptPath, rejection)
    } finally {
      rmSync(consumedPath, { force: true })
      rmSync(requestPath, { force: true })
    }
    return { kind: 'rejected', requestPath, receiptPath, reason }
  }
}

export function updateElectronCdpLaunchReceipt(
  receiptPath: string,
  input: {
    status: Extract<ElectronCdpLaunchReceiptStatus, 'ready' | 'failed'>
    now?: Date
    reason?: string
    readiness?: ElectronCdpEndpointReadiness
  },
): ElectronCdpLaunchReceipt {
  const resolvedPath = assertAbsolutePath(receiptPath, 'Electron CDP receipt path')
  try {
    assertPrivateFile(resolvedPath)
    const current = JSON.parse(readFileSync(resolvedPath, 'utf8')) as ElectronCdpLaunchReceipt
    const readiness = input.readiness
    const updated: ElectronCdpLaunchReceipt = {
      ...current,
      status: input.status,
      recordedAt: (input.now ?? new Date()).toISOString(),
      reason: input.reason ?? '',
      endpointBrowser: readiness?.browser ?? current.endpointBrowser,
      endpointWebSocketDebuggerUrl:
        readiness?.webSocketDebuggerUrl ?? current.endpointWebSocketDebuggerUrl,
      readinessAttempts: readiness?.attempts ?? current.readinessAttempts,
      readinessDurationMs: readiness?.durationMs ?? current.readinessDurationMs,
    }
    writePrivateJsonAtomicSync(resolvedPath, updated)
    return updated
  } catch (error) {
    if (error instanceof ElectronCdpLaunchError) throw error
    throw new ElectronCdpLaunchError('receipt_io_failed', 'Unable to update Electron CDP receipt.', error)
  }
}

export async function waitForElectronCdpEndpoint(input: {
  debuggingAddress: '127.0.0.1'
  debuggingPort: number
  timeoutMs: number
  intervalMs?: number
  probe?: () => Promise<unknown>
  now?: () => number
  delay?: (ms: number) => Promise<void>
}): Promise<ElectronCdpEndpointReadiness> {
  const now = input.now ?? Date.now
  const delay = input.delay ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)))
  const intervalMs = input.intervalMs ?? 250
  const startedAt = now()
  const deadline = startedAt + input.timeoutMs
  let attempts = 0
  let lastError = ''

  const probe =
    input.probe ??
    (async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.min(2_000, input.timeoutMs))
      try {
        const response = await fetch(
          `http://${input.debuggingAddress}:${input.debuggingPort}/json/version`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error(`CDP version endpoint returned ${response.status}.`)
        return await response.json()
      } finally {
        clearTimeout(timer)
      }
    })

  while (now() <= deadline) {
    attempts += 1
    try {
      const value = await probe()
      if (!isRecord(value)) throw new Error('CDP version response is not an object.')
      const browser = String(value.Browser ?? value.browser ?? '').trim()
      const webSocketDebuggerUrl = String(value.webSocketDebuggerUrl ?? '').trim()
      if (!browser || !/^ws:\/\//.test(webSocketDebuggerUrl)) {
        throw new Error('CDP version response is missing browser identity or WebSocket URL.')
      }
      return {
        ready: true,
        attempts,
        durationMs: Math.max(0, now() - startedAt),
        browser,
        webSocketDebuggerUrl,
        lastError: '',
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (now() >= deadline) break
    await delay(Math.min(intervalMs, Math.max(0, deadline - now())))
  }

  return {
    ready: false,
    attempts,
    durationMs: Math.max(0, now() - startedAt),
    browser: '',
    webSocketDebuggerUrl: '',
    lastError,
  }
}

export async function restoreCloakFailClosedAfterElectronCdpFailure(
  userDataDir: string,
  now = new Date(),
): Promise<{
  pilotEnabledProfileIds: string[]
  rolloutMode: string
  rolloutGlobalKillSwitch: boolean
  enabledBatchCount: number
  unguardedBatchCount: number
  healthOutcomeCount: number
}> {
  const pilotPath = getCloakPilotLocalConfigPath(userDataDir)
  const controlPath = getCloakRolloutControlPath(userDataDir)
  const healthPath = getCloakRolloutHealthPath(userDataDir)

  const currentControl = await readCloakRolloutControl(controlPath).catch(() => ({
    config: createDefaultCloakRolloutControl(),
  }))
  const failClosedControl = {
    ...currentControl.config,
    mode: 'off' as const,
    globalKillSwitch: true,
    batches: currentControl.config.batches.map((batch) => ({
      ...batch,
      enabled: false,
      killSwitch: true,
    })),
    updatedAt: now.toISOString(),
  }
  const pilot = await writeCloakPilotLocalConfigAtomic(pilotPath, {
    schemaVersion: CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
    enabledProfileIds: [],
    updatedAt: now.toISOString(),
  })
  const rollout = await writeCloakRolloutControlAtomic(controlPath, failClosedControl)
  const health = await readCloakRolloutHealth(healthPath)

  return {
    pilotEnabledProfileIds: pilot.config.enabledProfileIds,
    rolloutMode: rollout.config.mode,
    rolloutGlobalKillSwitch: rollout.config.globalKillSwitch,
    enabledBatchCount: rollout.config.batches.filter((batch) => batch.enabled).length,
    unguardedBatchCount: rollout.config.batches.filter((batch) => !batch.killSwitch).length,
    healthOutcomeCount: health.state.outcomes.length,
  }
}

export function hashElectronCdpLaunchRequest(request: ElectronCdpLaunchRequest): string {
  return canonicalHash(request)
}
