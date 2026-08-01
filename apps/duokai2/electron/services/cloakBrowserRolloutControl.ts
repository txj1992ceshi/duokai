import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from './cloakBrowserInstallPreflight.ts'

export const CLOAK_ROLLOUT_CONTROL_SCHEMA_VERSION = 1
export const CLOAK_ROLLOUT_HEALTH_SCHEMA_VERSION = 1

export type CloakRolloutMode = 'off' | 'observe' | 'enforce'

export interface CloakRolloutBatch {
  id: string
  enabled: boolean
  killSwitch: boolean
  profileIds: string[]
  maxConcurrentSessions: number
}

export interface CloakRolloutHealthPolicy {
  sampleWindowSize: number
  minimumSamples: number
  maxFailureRate: number
  maxConsecutiveFailures: number
  cooldownMs: number
}

export interface CloakRolloutControlConfig {
  schemaVersion: typeof CLOAK_ROLLOUT_CONTROL_SCHEMA_VERSION
  mode: CloakRolloutMode
  rolloutId: string
  globalKillSwitch: boolean
  targetBrowserVersion: typeof CLOAK_PILOT_BROWSER_VERSION
  targetBinarySha256: typeof CLOAK_PILOT_BINARY_SHA256
  batches: CloakRolloutBatch[]
  healthPolicy: CloakRolloutHealthPolicy
  updatedAt: string
}

export interface LoadedCloakRolloutControl {
  config: CloakRolloutControlConfig
  exists: boolean
  controlHash: string
  filePath: string
}

export interface CloakRolloutOutcome {
  profileId: string
  batchId: string
  success: boolean
  reason: string
  at: string
}

export interface CloakRolloutHealthState {
  schemaVersion: typeof CLOAK_ROLLOUT_HEALTH_SCHEMA_VERSION
  rolloutId: string
  outcomes: CloakRolloutOutcome[]
  updatedAt: string
}

export interface LoadedCloakRolloutHealth {
  state: CloakRolloutHealthState
  exists: boolean
  stateHash: string
  filePath: string
}

export type CloakRolloutDecisionReason =
  | 'control_off'
  | 'invalid_profile_id'
  | 'global_kill_switch'
  | 'profile_not_in_batch'
  | 'batch_disabled'
  | 'batch_kill_switch'
  | 'health_circuit_open'
  | 'concurrency_limit'
  | 'admitted'

export interface CloakRolloutHealthSummary {
  sampleCount: number
  failureCount: number
  failureRate: number
  consecutiveFailures: number
  failureRateExceeded: boolean
  consecutiveFailureLimitExceeded: boolean
  latestFailureAt: string
  cooldownUntil: string
  circuitOpen: boolean
}

export interface CloakRolloutDecision {
  profileId: string
  admitted: boolean
  wouldBlock: boolean
  enforced: boolean
  reason: CloakRolloutDecisionReason
  mode: CloakRolloutMode
  rolloutId: string
  batchId: string
  controlHash: string
  activeBatchSessions: number
  maxConcurrentSessions: number
  health: CloakRolloutHealthSummary
}

export interface CloakRolloutAdmissionInput {
  profileId: string
  activeProfileIds?: Iterable<string>
  reservedProfileIds?: Iterable<string>
  now?: Date
}

export class CloakRolloutControlError extends Error {
  readonly code:
    | 'invalid_path'
    | 'invalid_permissions'
    | 'invalid_control'
    | 'invalid_health_state'
    | 'control_io_failed'
    | 'health_io_failed'

  constructor(code: CloakRolloutControlError['code'], message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakRolloutControlError'
    this.code = code
  }
}

function canonicalHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function containsLineBreakOrNull(value: string): boolean {
  return value.includes('\0') || value.includes('\r') || value.includes('\n')
}

function replaceLineBreakOrNullRuns(value: string): string {
  let result = ''
  let insideReplacementRun = false
  for (const character of value) {
    const shouldReplace = character === '\0' || character === '\r' || character === '\n'
    if (shouldReplace) {
      if (!insideReplacementRun) result += ' '
      insideReplacementRun = true
      continue
    }
    result += character
    insideReplacementRun = false
  }
  return result
}

function normalizeConcreteId(value: unknown, label: string, allowEmpty = false): string {
  const result = String(value ?? '').trim()
  if (!result && allowEmpty) return ''
  if (!result || result === '*' || containsLineBreakOrNull(result)) {
    throw new CloakRolloutControlError(
      'invalid_control',
      `${label} must be a concrete non-wildcard identifier.`,
    )
  }
  return result
}

function normalizeIsoDate(value: unknown, label: string, allowEmpty = true): string {
  const result = String(value ?? '').trim()
  if (!result && allowEmpty) return ''
  if (!result || !Number.isFinite(Date.parse(result))) {
    throw new CloakRolloutControlError('invalid_control', `${label} must be an ISO date.`)
  }
  return result
}

function normalizeInteger(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const result = Number(value)
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new CloakRolloutControlError(
      'invalid_control',
      `${label} must be an integer between ${minimum} and ${maximum}.`,
    )
  }
  return result
}

function normalizeFiniteNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const result = Number(value)
  if (!Number.isFinite(result) || result < minimum || result > maximum) {
    throw new CloakRolloutControlError(
      'invalid_control',
      `${label} must be between ${minimum} and ${maximum}.`,
    )
  }
  return result
}

function normalizeMode(value: unknown): CloakRolloutMode {
  if (value === 'off' || value === 'observe' || value === 'enforce') return value
  throw new CloakRolloutControlError(
    'invalid_control',
    'Cloak rollout mode must be off, observe or enforce.',
  )
}

function defaultHealthPolicy(): CloakRolloutHealthPolicy {
  return {
    sampleWindowSize: 20,
    minimumSamples: 5,
    maxFailureRate: 0.25,
    maxConsecutiveFailures: 3,
    cooldownMs: 15 * 60 * 1000,
  }
}

export function createDefaultCloakRolloutControl(): CloakRolloutControlConfig {
  return {
    schemaVersion: CLOAK_ROLLOUT_CONTROL_SCHEMA_VERSION,
    mode: 'off',
    rolloutId: '',
    globalKillSwitch: false,
    targetBrowserVersion: CLOAK_PILOT_BROWSER_VERSION,
    targetBinarySha256: CLOAK_PILOT_BINARY_SHA256,
    batches: [],
    healthPolicy: defaultHealthPolicy(),
    updatedAt: '',
  }
}

function normalizeHealthPolicy(value: unknown): CloakRolloutHealthPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloakRolloutControlError(
      'invalid_control',
      'Cloak rollout healthPolicy must be an object.',
    )
  }
  const record = value as Record<string, unknown>
  const sampleWindowSize = normalizeInteger(
    record.sampleWindowSize,
    'healthPolicy.sampleWindowSize',
    1,
    1000,
  )
  const minimumSamples = normalizeInteger(
    record.minimumSamples,
    'healthPolicy.minimumSamples',
    1,
    sampleWindowSize,
  )
  return {
    sampleWindowSize,
    minimumSamples,
    maxFailureRate: normalizeFiniteNumber(
      record.maxFailureRate,
      'healthPolicy.maxFailureRate',
      0,
      1,
    ),
    maxConsecutiveFailures: normalizeInteger(
      record.maxConsecutiveFailures,
      'healthPolicy.maxConsecutiveFailures',
      1,
      sampleWindowSize,
    ),
    cooldownMs: normalizeInteger(record.cooldownMs, 'healthPolicy.cooldownMs', 1000, 86_400_000),
  }
}

function normalizeBatch(value: unknown): CloakRolloutBatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloakRolloutControlError('invalid_control', 'Each Cloak rollout batch must be an object.')
  }
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.profileIds)) {
    throw new CloakRolloutControlError(
      'invalid_control',
      'Each Cloak rollout batch profileIds value must be an array.',
    )
  }
  const profileIds = Array.from(
    new Set(record.profileIds.map((entry) => normalizeConcreteId(entry, 'Profile ID'))),
  ).sort()
  return {
    id: normalizeConcreteId(record.id, 'Batch ID'),
    enabled: record.enabled === true,
    killSwitch: record.killSwitch === true,
    profileIds,
    maxConcurrentSessions: normalizeInteger(
      record.maxConcurrentSessions,
      'batch.maxConcurrentSessions',
      1,
      100,
    ),
  }
}

function normalizeControl(value: unknown): CloakRolloutControlConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloakRolloutControlError(
      'invalid_control',
      'Cloak rollout control must be a JSON object.',
    )
  }
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== CLOAK_ROLLOUT_CONTROL_SCHEMA_VERSION) {
    throw new CloakRolloutControlError(
      'invalid_control',
      `Unsupported Cloak rollout control schema ${String(record.schemaVersion)}.`,
    )
  }
  const mode = normalizeMode(record.mode)
  const rolloutId = normalizeConcreteId(record.rolloutId, 'Rollout ID', mode === 'off')
  if (record.targetBrowserVersion !== CLOAK_PILOT_BROWSER_VERSION) {
    throw new CloakRolloutControlError(
      'invalid_control',
      `Cloak rollout targetBrowserVersion must remain fixed at ${CLOAK_PILOT_BROWSER_VERSION}.`,
    )
  }
  if (
    String(record.targetBinarySha256 ?? '').trim().toLowerCase() !==
    CLOAK_PILOT_BINARY_SHA256.toLowerCase()
  ) {
    throw new CloakRolloutControlError(
      'invalid_control',
      'Cloak rollout targetBinarySha256 does not match the pinned Pilot binary.',
    )
  }
  if (!Array.isArray(record.batches)) {
    throw new CloakRolloutControlError('invalid_control', 'Cloak rollout batches must be an array.')
  }
  const batches = record.batches.map(normalizeBatch)
  const batchIds = new Set<string>()
  const assignedProfiles = new Map<string, string>()
  for (const batch of batches) {
    if (batchIds.has(batch.id)) {
      throw new CloakRolloutControlError(
        'invalid_control',
        `Duplicate Cloak rollout batch ID ${batch.id}.`,
      )
    }
    batchIds.add(batch.id)
    for (const profileId of batch.profileIds) {
      const previousBatch = assignedProfiles.get(profileId)
      if (previousBatch) {
        throw new CloakRolloutControlError(
          'invalid_control',
          `Profile ${profileId} is assigned to both ${previousBatch} and ${batch.id}.`,
        )
      }
      assignedProfiles.set(profileId, batch.id)
    }
  }
  return {
    schemaVersion: CLOAK_ROLLOUT_CONTROL_SCHEMA_VERSION,
    mode,
    rolloutId,
    globalKillSwitch: record.globalKillSwitch === true,
    targetBrowserVersion: CLOAK_PILOT_BROWSER_VERSION,
    targetBinarySha256: CLOAK_PILOT_BINARY_SHA256,
    batches: [...batches].sort((left, right) => left.id.localeCompare(right.id)),
    healthPolicy: normalizeHealthPolicy(record.healthPolicy),
    updatedAt: normalizeIsoDate(record.updatedAt, 'updatedAt'),
  }
}

function defaultHealthState(rolloutId = ''): CloakRolloutHealthState {
  return {
    schemaVersion: CLOAK_ROLLOUT_HEALTH_SCHEMA_VERSION,
    rolloutId,
    outcomes: [],
    updatedAt: '',
  }
}

function normalizeOutcome(value: unknown): CloakRolloutOutcome {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloakRolloutControlError(
      'invalid_health_state',
      'Each Cloak rollout outcome must be an object.',
    )
  }
  const record = value as Record<string, unknown>
  const at = String(record.at ?? '').trim()
  if (!at || !Number.isFinite(Date.parse(at))) {
    throw new CloakRolloutControlError(
      'invalid_health_state',
      'Cloak rollout outcome at must be an ISO date.',
    )
  }
  const reason = String(record.reason ?? '').trim()
  if (!reason || containsLineBreakOrNull(reason)) {
    throw new CloakRolloutControlError(
      'invalid_health_state',
      'Cloak rollout outcome reason must be non-empty and single-line.',
    )
  }
  return {
    profileId: normalizeConcreteId(record.profileId, 'Outcome Profile ID'),
    batchId: normalizeConcreteId(record.batchId, 'Outcome batch ID'),
    success: record.success === true,
    reason,
    at,
  }
}

function normalizeHealthState(value: unknown): CloakRolloutHealthState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CloakRolloutControlError(
      'invalid_health_state',
      'Cloak rollout health state must be a JSON object.',
    )
  }
  const record = value as Record<string, unknown>
  if (record.schemaVersion !== CLOAK_ROLLOUT_HEALTH_SCHEMA_VERSION) {
    throw new CloakRolloutControlError(
      'invalid_health_state',
      `Unsupported Cloak rollout health schema ${String(record.schemaVersion)}.`,
    )
  }
  if (!Array.isArray(record.outcomes) || record.outcomes.length > 1000) {
    throw new CloakRolloutControlError(
      'invalid_health_state',
      'Cloak rollout outcomes must be an array with at most 1000 entries.',
    )
  }
  const rolloutId = normalizeConcreteId(record.rolloutId, 'Health rollout ID', true)
  const updatedAt = String(record.updatedAt ?? '').trim()
  if (updatedAt && !Number.isFinite(Date.parse(updatedAt))) {
    throw new CloakRolloutControlError(
      'invalid_health_state',
      'Cloak rollout health updatedAt must be an ISO date.',
    )
  }
  return {
    schemaVersion: CLOAK_ROLLOUT_HEALTH_SCHEMA_VERSION,
    rolloutId,
    outcomes: record.outcomes.map(normalizeOutcome),
    updatedAt,
  }
}

function assertAbsolutePath(filePath: string, label: string): string {
  if (!path.isAbsolute(filePath)) {
    throw new CloakRolloutControlError('invalid_path', `${label} must be absolute.`)
  }
  return path.resolve(filePath)
}

async function assertPrivateFile(filePath: string): Promise<void> {
  if (process.platform === 'win32') return
  const metadata = await stat(filePath)
  if ((metadata.mode & 0o077) !== 0) {
    throw new CloakRolloutControlError(
      'invalid_permissions',
      `Cloak rollout state must be private; mode=${(metadata.mode & 0o777).toString(8)}.`,
    )
  }
}

async function fsyncDirectory(directoryPath: string): Promise<void> {
  if (process.platform === 'win32') return
  const handle = await open(directoryPath, 'r')
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function writePrivateJsonAtomic(
  filePath: string,
  value: unknown,
  ioCode: 'control_io_failed' | 'health_io_failed',
): Promise<void> {
  const directory = path.dirname(filePath)
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${randomUUID()}.tmp`)
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    if (process.platform !== 'win32') await chmod(directory, 0o700)
    await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    })
    if (process.platform !== 'win32') await chmod(temporaryPath, 0o600)
    const handle = await open(temporaryPath, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporaryPath, filePath)
    if (process.platform !== 'win32') await chmod(filePath, 0o600)
    await fsyncDirectory(directory)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => {})
    if (error instanceof CloakRolloutControlError) throw error
    throw new CloakRolloutControlError(ioCode, 'Unable to persist Cloak rollout state atomically.', error)
  }
}

export function getCloakRolloutControlPath(userDataDir: string): string {
  const root = assertAbsolutePath(userDataDir, 'Electron userData directory')
  return path.join(root, 'cloak-pilot', 'rollout-control.json')
}

export function getCloakRolloutHealthPath(userDataDir: string): string {
  const root = assertAbsolutePath(userDataDir, 'Electron userData directory')
  return path.join(root, 'cloak-pilot', 'rollout-health.json')
}

export async function readCloakRolloutControl(
  filePath: string,
): Promise<LoadedCloakRolloutControl> {
  const resolvedPath = assertAbsolutePath(filePath, 'Cloak rollout control path')
  try {
    const content = await readFile(resolvedPath, 'utf8')
    await assertPrivateFile(resolvedPath)
    const config = normalizeControl(JSON.parse(content) as unknown)
    return {
      config,
      exists: true,
      controlHash: canonicalHash(config),
      filePath: resolvedPath,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const config = createDefaultCloakRolloutControl()
      return {
        config,
        exists: false,
        controlHash: canonicalHash(config),
        filePath: resolvedPath,
      }
    }
    if (error instanceof CloakRolloutControlError) throw error
    if (error instanceof SyntaxError) {
      throw new CloakRolloutControlError(
        'invalid_control',
        'Cloak rollout control contains malformed JSON.',
        error,
      )
    }
    throw new CloakRolloutControlError(
      'control_io_failed',
      'Unable to read Cloak rollout control.',
      error,
    )
  }
}

export async function writeCloakRolloutControlAtomic(
  filePath: string,
  input: CloakRolloutControlConfig,
): Promise<LoadedCloakRolloutControl> {
  const resolvedPath = assertAbsolutePath(filePath, 'Cloak rollout control path')
  const config = normalizeControl(input)
  await writePrivateJsonAtomic(resolvedPath, config, 'control_io_failed')
  return await readCloakRolloutControl(resolvedPath)
}

export async function readCloakRolloutHealth(
  filePath: string,
): Promise<LoadedCloakRolloutHealth> {
  const resolvedPath = assertAbsolutePath(filePath, 'Cloak rollout health path')
  try {
    const content = await readFile(resolvedPath, 'utf8')
    await assertPrivateFile(resolvedPath)
    const state = normalizeHealthState(JSON.parse(content) as unknown)
    return {
      state,
      exists: true,
      stateHash: canonicalHash(state),
      filePath: resolvedPath,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      const state = defaultHealthState()
      return {
        state,
        exists: false,
        stateHash: canonicalHash(state),
        filePath: resolvedPath,
      }
    }
    if (error instanceof CloakRolloutControlError) throw error
    if (error instanceof SyntaxError) {
      throw new CloakRolloutControlError(
        'invalid_health_state',
        'Cloak rollout health state contains malformed JSON.',
        error,
      )
    }
    throw new CloakRolloutControlError(
      'health_io_failed',
      'Unable to read Cloak rollout health state.',
      error,
    )
  }
}

export async function writeCloakRolloutHealthAtomic(
  filePath: string,
  input: CloakRolloutHealthState,
): Promise<LoadedCloakRolloutHealth> {
  const resolvedPath = assertAbsolutePath(filePath, 'Cloak rollout health path')
  const state = normalizeHealthState(input)
  await writePrivateJsonAtomic(resolvedPath, state, 'health_io_failed')
  return await readCloakRolloutHealth(resolvedPath)
}

function findBatchForProfile(
  profileId: string,
  control: CloakRolloutControlConfig,
): CloakRolloutBatch | null {
  return control.batches.find((batch) => batch.profileIds.includes(profileId)) ?? null
}

function summarizeHealth(
  batchId: string,
  control: CloakRolloutControlConfig,
  health: CloakRolloutHealthState,
  now: Date,
): CloakRolloutHealthSummary {
  const outcomes =
    health.rolloutId === control.rolloutId
      ? health.outcomes
          .filter((outcome) => outcome.batchId === batchId)
          .slice(-control.healthPolicy.sampleWindowSize)
      : []
  const failures = outcomes.filter((outcome) => !outcome.success)
  let consecutiveFailures = 0
  for (let index = outcomes.length - 1; index >= 0; index -= 1) {
    if (outcomes[index]?.success) break
    consecutiveFailures += 1
  }
  const failureRate = outcomes.length === 0 ? 0 : failures.length / outcomes.length
  const failureRateExceeded =
    outcomes.length >= control.healthPolicy.minimumSamples &&
    failureRate > control.healthPolicy.maxFailureRate
  const consecutiveFailureLimitExceeded =
    consecutiveFailures >= control.healthPolicy.maxConsecutiveFailures
  const latestFailureAt = failures.at(-1)?.at ?? ''
  const latestFailureTime = latestFailureAt ? Date.parse(latestFailureAt) : Number.NaN
  const cooldownUntilTime = Number.isFinite(latestFailureTime)
    ? latestFailureTime + control.healthPolicy.cooldownMs
    : Number.NaN
  const cooldownUntil = Number.isFinite(cooldownUntilTime)
    ? new Date(cooldownUntilTime).toISOString()
    : ''
  const circuitOpen =
    (failureRateExceeded || consecutiveFailureLimitExceeded) &&
    Number.isFinite(cooldownUntilTime) &&
    now.getTime() < cooldownUntilTime
  return {
    sampleCount: outcomes.length,
    failureCount: failures.length,
    failureRate,
    consecutiveFailures,
    failureRateExceeded,
    consecutiveFailureLimitExceeded,
    latestFailureAt,
    cooldownUntil,
    circuitOpen,
  }
}

function decide(
  loaded: LoadedCloakRolloutControl,
  profileId: string,
  batch: CloakRolloutBatch | null,
  reason: CloakRolloutDecisionReason,
  health: CloakRolloutHealthSummary,
  activeBatchSessions: number,
): CloakRolloutDecision {
  const mode = loaded.config.mode
  const wouldBlock = reason !== 'control_off' && reason !== 'admitted'
  return {
    profileId,
    admitted: mode !== 'enforce' || !wouldBlock,
    wouldBlock,
    enforced: mode === 'enforce',
    reason,
    mode,
    rolloutId: loaded.config.rolloutId,
    batchId: batch?.id ?? '',
    controlHash: loaded.controlHash,
    activeBatchSessions,
    maxConcurrentSessions: batch?.maxConcurrentSessions ?? 0,
    health,
  }
}

const emptyHealthSummary: CloakRolloutHealthSummary = {
  sampleCount: 0,
  failureCount: 0,
  failureRate: 0,
  consecutiveFailures: 0,
  failureRateExceeded: false,
  consecutiveFailureLimitExceeded: false,
  latestFailureAt: '',
  cooldownUntil: '',
  circuitOpen: false,
}

export function evaluateCloakRolloutAdmission(
  loaded: LoadedCloakRolloutControl,
  health: LoadedCloakRolloutHealth,
  input: CloakRolloutAdmissionInput,
): CloakRolloutDecision {
  const profileId = String(input.profileId ?? '').trim()
  if (loaded.config.mode === 'off') {
    return decide(loaded, profileId, null, 'control_off', emptyHealthSummary, 0)
  }
  if (!profileId || profileId === '*' || containsLineBreakOrNull(profileId)) {
    return decide(loaded, profileId, null, 'invalid_profile_id', emptyHealthSummary, 0)
  }
  const batch = findBatchForProfile(profileId, loaded.config)
  if (loaded.config.globalKillSwitch) {
    return decide(loaded, profileId, batch, 'global_kill_switch', emptyHealthSummary, 0)
  }
  if (!batch) {
    return decide(loaded, profileId, null, 'profile_not_in_batch', emptyHealthSummary, 0)
  }
  const activeIds = new Set([
    ...Array.from(input.activeProfileIds ?? [], (entry) => String(entry)),
    ...Array.from(input.reservedProfileIds ?? [], (entry) => String(entry)),
  ])
  activeIds.delete(profileId)
  const activeBatchSessions = batch.profileIds.filter((entry) => activeIds.has(entry)).length
  const healthSummary = summarizeHealth(
    batch.id,
    loaded.config,
    health.state,
    input.now ?? new Date(),
  )
  if (!batch.enabled) {
    return decide(loaded, profileId, batch, 'batch_disabled', healthSummary, activeBatchSessions)
  }
  if (batch.killSwitch) {
    return decide(loaded, profileId, batch, 'batch_kill_switch', healthSummary, activeBatchSessions)
  }
  if (healthSummary.circuitOpen) {
    return decide(loaded, profileId, batch, 'health_circuit_open', healthSummary, activeBatchSessions)
  }
  if (activeBatchSessions >= batch.maxConcurrentSessions) {
    return decide(loaded, profileId, batch, 'concurrency_limit', healthSummary, activeBatchSessions)
  }
  return decide(loaded, profileId, batch, 'admitted', healthSummary, activeBatchSessions)
}

export async function recordCloakRolloutOutcomeAtomic(
  filePath: string,
  loadedControl: LoadedCloakRolloutControl,
  input: Omit<CloakRolloutOutcome, 'at'> & { at?: Date },
): Promise<LoadedCloakRolloutHealth> {
  const profileId = normalizeConcreteId(input.profileId, 'Outcome Profile ID')
  const batchId = normalizeConcreteId(input.batchId, 'Outcome batch ID')
  const current = await readCloakRolloutHealth(filePath)
  const existingOutcomes =
    current.state.rolloutId === loadedControl.config.rolloutId ? current.state.outcomes : []
  const at = input.at ?? new Date()
  const reason =
    replaceLineBreakOrNullRuns(String(input.reason || '').trim()).slice(0, 500) ||
    (input.success ? 'success' : 'failure')
  const next: CloakRolloutHealthState = {
    schemaVersion: CLOAK_ROLLOUT_HEALTH_SCHEMA_VERSION,
    rolloutId: loadedControl.config.rolloutId,
    outcomes: [
      ...existingOutcomes,
      {
        profileId,
        batchId,
        success: input.success,
        reason,
        at: at.toISOString(),
      },
    ].slice(-loadedControl.config.healthPolicy.sampleWindowSize),
    updatedAt: at.toISOString(),
  }
  return await writeCloakRolloutHealthAtomic(filePath, next)
}

export async function setCloakRolloutGlobalKillSwitch(
  filePath: string,
  enabled: boolean,
  now = new Date(),
): Promise<LoadedCloakRolloutControl> {
  const current = await readCloakRolloutControl(filePath)
  if (!current.exists) {
    throw new CloakRolloutControlError(
      'invalid_control',
      'Create an explicit Cloak rollout control before changing its global kill switch.',
    )
  }
  return await writeCloakRolloutControlAtomic(filePath, {
    ...current.config,
    globalKillSwitch: enabled,
    updatedAt: now.toISOString(),
  })
}

export async function setCloakRolloutBatchKillSwitch(
  filePath: string,
  batchIdInput: string,
  enabled: boolean,
  now = new Date(),
): Promise<LoadedCloakRolloutControl> {
  const batchId = normalizeConcreteId(batchIdInput, 'Batch ID')
  const current = await readCloakRolloutControl(filePath)
  const batchExists = current.config.batches.some((batch) => batch.id === batchId)
  if (!current.exists || !batchExists) {
    throw new CloakRolloutControlError(
      'invalid_control',
      `Cloak rollout batch ${batchId} does not exist.`,
    )
  }
  return await writeCloakRolloutControlAtomic(filePath, {
    ...current.config,
    batches: current.config.batches.map((batch) =>
      batch.id === batchId ? { ...batch, killSwitch: enabled } : batch,
    ),
    updatedAt: now.toISOString(),
  })
}

export interface CloakRolloutAdmissionLease {
  decision: CloakRolloutDecision
  recordSuccess(reason?: string, at?: Date): Promise<boolean>
  recordFailure(reason: string, at?: Date): Promise<boolean>
  release(): void
}

export interface CloakRolloutGovernorOptions {
  controlPath: string
  healthPath: string
  getActiveProfileIds?: () => Iterable<string>
  now?: () => Date
}

export class CloakRolloutGovernor {
  private readonly controlPath: string
  private readonly healthPath: string
  private readonly getActiveProfileIds: () => Iterable<string>
  private readonly now: () => Date
  private readonly reservations = new Set<string>()
  private outcomeWriteTail: Promise<void> = Promise.resolve()

  constructor(options: CloakRolloutGovernorOptions) {
    this.controlPath = assertAbsolutePath(options.controlPath, 'Cloak rollout control path')
    this.healthPath = assertAbsolutePath(options.healthPath, 'Cloak rollout health path')
    this.getActiveProfileIds = options.getActiveProfileIds ?? (() => [])
    this.now = options.now ?? (() => new Date())
  }

  getReservedProfileIds(): string[] {
    return [...this.reservations].sort()
  }

  private async appendOutcome(
    admissionControl: LoadedCloakRolloutControl,
    decision: CloakRolloutDecision,
    profileId: string,
    success: boolean,
    reason: string,
    at: Date,
  ): Promise<boolean> {
    let resolveResult!: (value: boolean) => void
    let rejectResult!: (reason?: unknown) => void
    const result = new Promise<boolean>((resolve, reject) => {
      resolveResult = resolve
      rejectResult = reject
    })
    const operation = this.outcomeWriteTail.then(async () => {
      try {
        const currentControl = await readCloakRolloutControl(this.controlPath)
        const currentBatch = currentControl.config.batches.find(
          (batch) => batch.id === decision.batchId && batch.profileIds.includes(profileId),
        )
        if (
          currentControl.config.mode === 'off' ||
          currentControl.config.rolloutId !== admissionControl.config.rolloutId ||
          !currentBatch
        ) {
          resolveResult(false)
          return
        }
        await recordCloakRolloutOutcomeAtomic(this.healthPath, currentControl, {
          profileId,
          batchId: currentBatch.id,
          success,
          reason,
          at,
        })
        resolveResult(true)
      } catch (error) {
        rejectResult(error)
      }
    })
    this.outcomeWriteTail = operation.then(
      () => undefined,
      () => undefined,
    )
    return await result
  }

  async requestAdmission(profileId: string): Promise<CloakRolloutAdmissionLease> {
    const control = await readCloakRolloutControl(this.controlPath)
    const defaultState = defaultHealthState()
    const health: LoadedCloakRolloutHealth =
      control.config.mode === 'off'
        ? {
            state: defaultState,
            exists: false,
            stateHash: canonicalHash(defaultState),
            filePath: this.healthPath,
          }
        : await readCloakRolloutHealth(this.healthPath)
    const decision = evaluateCloakRolloutAdmission(control, health, {
      profileId,
      activeProfileIds: this.getActiveProfileIds(),
      reservedProfileIds: this.reservations,
      now: this.now(),
    })
    if (decision.admitted && decision.batchId) {
      this.reservations.add(profileId)
    }

    let released = false
    let outcomeRecorded = false
    const release = () => {
      if (released) return
      released = true
      this.reservations.delete(profileId)
    }
    const record = async (success: boolean, reason: string, at?: Date): Promise<boolean> => {
      if (outcomeRecorded) return false
      outcomeRecorded = true
      try {
        if (!decision.batchId || control.config.mode === 'off') return false
        return await this.appendOutcome(
          control,
          decision,
          profileId,
          success,
          reason,
          at ?? this.now(),
        )
      } finally {
        release()
      }
    }

    return {
      decision,
      recordSuccess: async (reason = 'trusted', at?: Date) =>
        await record(true, reason, at),
      recordFailure: async (reason: string, at?: Date) =>
        await record(false, reason, at),
      release,
    }
  }
}
