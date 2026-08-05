import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from './cloakBrowserInstallPreflight.ts'
import {
  evaluateCloakPilotLocalEligibility,
  type LoadedCloakPilotLocalConfig,
} from './cloakBrowserPilotConfig.ts'
import {
  evaluateCloakRolloutAdmission,
  type CloakRolloutControlConfig,
  type LoadedCloakRolloutControl,
  type LoadedCloakRolloutHealth,
} from './cloakBrowserRolloutControl.ts'
import {
  canonicalJson,
  type CloakSnapshotSigningKeyProvider,
} from './cloakBrowserSnapshotSignature.ts'

export const CLOAK_CANARY_REHEARSAL_SCHEMA_VERSION = 2
export const CLOAK_CANARY_AUTHORIZATION_SCHEMA_VERSION = 2
export const CLOAK_CANARY_AUTHORIZATION_ALGORITHM = 'HMAC-SHA256' as const

export type CloakCanaryRehearsalStage = 'observe' | 'promote-enforce'

export interface CloakCanaryRehearsalPolicy {
  minimumObservationDurationMs: number
  minimumSuccessfulSamples: number
  maximumFailedSamples: number
  maximumLatestSampleAgeMs: number
  authorizationTtlMs: number
}

export interface CloakCanaryOwnerConfirmation {
  ownerId: string
  confirmedAt: string
}

export interface CloakCanaryRehearsalRequest {
  stage: CloakCanaryRehearsalStage
  rehearsalId: string
  profileId: string
  rolloutId: string
  batchId: string
  ownerConfirmation?: CloakCanaryOwnerConfirmation
}

export interface CloakCanaryRuntimeState {
  runningProfileIds?: Iterable<string>
  queuedProfileIds?: Iterable<string>
  startingProfileIds?: Iterable<string>
}

export interface CloakCanaryRehearsalCheck {
  code: string
  passed: boolean
  detail: string
}

export interface CloakCanaryObservationSummary {
  sampleCount: number
  successCount: number
  failureCount: number
  firstOutcomeAt: string
  latestOutcomeAt: string
  durationMs: number
  latestSampleAgeMs: number
}

export interface CloakCanaryRehearsalReport {
  schemaVersion: typeof CLOAK_CANARY_REHEARSAL_SCHEMA_VERSION
  stage: CloakCanaryRehearsalStage
  ready: boolean
  rehearsalId: string
  profileId: string
  rolloutId: string
  batchId: string
  sourceMode: string
  targetMode: 'observe' | 'enforce'
  targetBrowserVersion: typeof CLOAK_PILOT_BROWSER_VERSION
  targetBinarySha256: typeof CLOAK_PILOT_BINARY_SHA256
  pilotConfigHash: string
  sourceControlHash: string
  healthStateHash: string
  targetControlHash: string
  generatedAt: string
  expiresAt: string
  ownerConfirmation: CloakCanaryOwnerConfirmation | null
  observation: CloakCanaryObservationSummary
  checks: CloakCanaryRehearsalCheck[]
  targetControl: CloakRolloutControlConfig | null
  reportHash: string
}

export interface CloakCanaryAuthorizationSignature {
  algorithm: typeof CLOAK_CANARY_AUTHORIZATION_ALGORITHM
  keyId: string
  signedAt: string
  payloadSha256: string
  valueBase64: string
}

export interface CloakSignedCanaryAuthorization {
  schemaVersion: typeof CLOAK_CANARY_AUTHORIZATION_SCHEMA_VERSION
  report: CloakCanaryRehearsalReport
  signature: CloakCanaryAuthorizationSignature
}

export class CloakCanaryRehearsalError extends Error {
  readonly code:
    | 'invalid_request'
    | 'not_ready'
    | 'invalid_authorization'
    | 'authorization_expired'
    | 'signing_key_unavailable'

  constructor(code: CloakCanaryRehearsalError['code'], message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakCanaryRehearsalError'
    this.code = code
  }
}

const DEFAULT_POLICY: CloakCanaryRehearsalPolicy = {
  minimumObservationDurationMs: 30 * 60 * 1000,
  minimumSuccessfulSamples: 3,
  maximumFailedSamples: 0,
  maximumLatestSampleAgeMs: 30 * 60 * 1000,
  authorizationTtlMs: 10 * 60 * 1000,
}

const EMPTY_OBSERVATION: CloakCanaryObservationSummary = {
  sampleCount: 0,
  successCount: 0,
  failureCount: 0,
  firstOutcomeAt: '',
  latestOutcomeAt: '',
  durationMs: 0,
  latestSampleAgeMs: 0,
}

function canonicalHash(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

function concreteId(value: unknown): string {
  const result = String(value ?? '').trim()
  if (
    !result ||
    result === '*' ||
    result.includes('\0') ||
    result.includes('\r') ||
    result.includes('\n')
  ) {
    return ''
  }
  return result
}

function validIso(value: unknown): string {
  const result = String(value ?? '').trim()
  return result && Number.isFinite(Date.parse(result)) ? result : ''
}

function normalizePolicy(
  input: Partial<CloakCanaryRehearsalPolicy> | undefined,
): CloakCanaryRehearsalPolicy {
  const policy = { ...DEFAULT_POLICY, ...input }
  const integerFields: Array<keyof CloakCanaryRehearsalPolicy> = [
    'minimumObservationDurationMs',
    'minimumSuccessfulSamples',
    'maximumFailedSamples',
    'maximumLatestSampleAgeMs',
    'authorizationTtlMs',
  ]
  for (const field of integerFields) {
    if (!Number.isInteger(policy[field]) || policy[field] < 0) {
      throw new CloakCanaryRehearsalError(
        'invalid_request',
        `Canary rehearsal policy ${field} must be a non-negative integer.`,
      )
    }
  }
  if (policy.minimumSuccessfulSamples < 1) {
    throw new CloakCanaryRehearsalError(
      'invalid_request',
      'Canary rehearsal minimumSuccessfulSamples must be at least 1.',
    )
  }
  if (policy.authorizationTtlMs < 1000 || policy.authorizationTtlMs > 86_400_000) {
    throw new CloakCanaryRehearsalError(
      'invalid_request',
      'Canary authorization TTL must be between 1 second and 24 hours.',
    )
  }
  return policy
}

function toIdSet(values: Iterable<string> | undefined): Set<string> {
  return new Set(Array.from(values ?? [], (entry) => String(entry).trim()).filter(Boolean))
}

function observationSummary(
  loadedHealth: LoadedCloakRolloutHealth,
  rolloutId: string,
  batchId: string,
  profileId: string,
  now: Date,
): CloakCanaryObservationSummary {
  if (loadedHealth.state.rolloutId !== rolloutId) return { ...EMPTY_OBSERVATION }
  const outcomes = loadedHealth.state.outcomes
    .filter(
      (outcome) => outcome.batchId === batchId && outcome.profileId === profileId,
    )
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
  if (outcomes.length === 0) return { ...EMPTY_OBSERVATION }
  const firstOutcomeAt = outcomes[0]?.at ?? ''
  const latestOutcomeAt = outcomes.at(-1)?.at ?? ''
  const firstTime = Date.parse(firstOutcomeAt)
  const latestTime = Date.parse(latestOutcomeAt)
  return {
    sampleCount: outcomes.length,
    successCount: outcomes.filter((outcome) => outcome.success).length,
    failureCount: outcomes.filter((outcome) => !outcome.success).length,
    firstOutcomeAt,
    latestOutcomeAt,
    durationMs: Math.max(0, latestTime - firstTime),
    latestSampleAgeMs: Math.max(0, now.getTime() - latestTime),
  }
}

function reportHash(
  report: Omit<CloakCanaryRehearsalReport, 'reportHash'>,
): string {
  return canonicalHash(report)
}

export function evaluateCloakCanaryRehearsal(input: {
  request: CloakCanaryRehearsalRequest
  pilotConfig: LoadedCloakPilotLocalConfig
  rolloutControl: LoadedCloakRolloutControl
  rolloutHealth: LoadedCloakRolloutHealth
  runtimeState?: CloakCanaryRuntimeState
  policy?: Partial<CloakCanaryRehearsalPolicy>
  now?: Date
}): CloakCanaryRehearsalReport {
  const now = input.now ?? new Date()
  const policy = normalizePolicy(input.policy)
  const request = input.request
  const rehearsalId = concreteId(request.rehearsalId)
  const profileId = concreteId(request.profileId)
  const rolloutId = concreteId(request.rolloutId)
  const batchId = concreteId(request.batchId)
  const control = input.rolloutControl.config
  const batch = control.batches.find((entry) => entry.id === batchId) ?? null
  const eligibility = evaluateCloakPilotLocalEligibility(profileId, input.pilotConfig)
  const running = toIdSet(input.runtimeState?.runningProfileIds)
  const queued = toIdSet(input.runtimeState?.queuedProfileIds)
  const starting = toIdSet(input.runtimeState?.startingProfileIds)
  const admission = evaluateCloakRolloutAdmission(
    input.rolloutControl,
    input.rolloutHealth,
    {
      profileId,
      activeProfileIds: running,
      reservedProfileIds: new Set([...queued, ...starting]),
      now,
    },
  )
  const observation = observationSummary(
    input.rolloutHealth,
    rolloutId,
    batchId,
    profileId,
    now,
  )
  const ownerConfirmation = request.ownerConfirmation
    ? {
        ownerId: concreteId(request.ownerConfirmation.ownerId),
        confirmedAt: validIso(request.ownerConfirmation.confirmedAt),
      }
    : null

  const checks: CloakCanaryRehearsalCheck[] = []
  const check = (code: string, passed: boolean, detail: string) => {
    checks.push({ code, passed, detail })
  }

  check('request.rehearsal_id', Boolean(rehearsalId), 'Rehearsal ID must be concrete.')
  check('request.profile_id', Boolean(profileId), 'Profile ID must be concrete and non-wildcard.')
  check('request.rollout_id', Boolean(rolloutId), 'Rollout ID must be concrete.')
  check('request.batch_id', Boolean(batchId), 'Batch ID must be concrete.')
  check('pilot.config_exists', input.pilotConfig.exists, 'An explicit Pilot config is required.')
  check(
    'pilot.single_profile',
    eligibility.enabled &&
      !input.pilotConfig.config.defaultEnabled &&
      input.pilotConfig.config.enabledProfileIds.length === 1 &&
      input.pilotConfig.config.enabledProfileIds[0] === profileId &&
      input.pilotConfig.config.disabledProfileIds.length === 0,
    'Exactly the rehearsal Profile may be enabled in the Pilot config.',
  )
  check('rollout.control_exists', input.rolloutControl.exists, 'An explicit rollout control is required.')
  check(
    'rollout.observe_mode',
    control.mode === 'observe',
    'Readiness and promotion authorization must be derived from observe mode.',
  )
  check(
    'rollout.identity',
    control.rolloutId === rolloutId,
    'The request must match the exact rollout identity.',
  )
  check(
    'rollout.fixed_binary',
    control.targetBrowserVersion === CLOAK_PILOT_BROWSER_VERSION &&
      control.targetBinarySha256.toLowerCase() === CLOAK_PILOT_BINARY_SHA256.toLowerCase(),
    'The rollout must remain bound to the pinned Cloak version and binary SHA256.',
  )
  check(
    'rollout.single_batch',
    control.batches.length === 1 && Boolean(batch),
    'A single-Profile rehearsal must use exactly one rollout batch.',
  )
  check(
    'rollout.single_profile_batch',
    Boolean(
      batch &&
        batch.profileIds.length === 1 &&
        batch.profileIds[0] === profileId &&
        batch.maxConcurrentSessions === 1,
    ),
    'The canary batch must contain only the rehearsal Profile with concurrency 1.',
  )
  check(
    'rollout.switches_clear',
    !control.globalKillSwitch && Boolean(batch?.enabled) && !batch?.killSwitch,
    'Global and batch kill switches must be clear and the batch enabled.',
  )
  check(
    'runtime.profile_stopped',
    !running.has(profileId) && !queued.has(profileId) && !starting.has(profileId),
    'The rehearsal Profile must not be running, queued or starting.',
  )
  check(
    'rollout.admission_clean',
    admission.reason === 'admitted' && !admission.wouldBlock,
    `Observe admission must be clean; current reason=${admission.reason}.`,
  )

  if (request.stage === 'promote-enforce') {
    check(
      'observation.minimum_successes',
      observation.successCount >= policy.minimumSuccessfulSamples,
      `At least ${policy.minimumSuccessfulSamples} successful observe samples are required.`,
    )
    check(
      'observation.failure_budget',
      observation.failureCount <= policy.maximumFailedSamples,
      `Observe failures must not exceed ${policy.maximumFailedSamples}.`,
    )
    check(
      'observation.minimum_duration',
      observation.durationMs >= policy.minimumObservationDurationMs,
      `Observe evidence must span at least ${policy.minimumObservationDurationMs} ms.`,
    )
    check(
      'observation.latest_fresh',
      observation.sampleCount > 0 &&
        observation.latestSampleAgeMs <= policy.maximumLatestSampleAgeMs,
      `Latest observe evidence must be no older than ${policy.maximumLatestSampleAgeMs} ms.`,
    )
    const latestOutcome = input.rolloutHealth.state.outcomes
      .filter(
        (outcome) =>
          outcome.batchId === batchId &&
          outcome.profileId === profileId &&
          input.rolloutHealth.state.rolloutId === rolloutId,
      )
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
      .at(-1)
    check(
      'observation.latest_success',
      latestOutcome?.success === true,
      'The latest observe outcome must be successful.',
    )
    check(
      'owner_confirmation.present',
      Boolean(ownerConfirmation?.ownerId && ownerConfirmation.confirmedAt),
      'Project owner identity and explicit confirmation time are required.',
    )
    const confirmedAt = ownerConfirmation?.confirmedAt
      ? Date.parse(ownerConfirmation.confirmedAt)
      : Number.NaN
    const latestOutcomeAt = observation.latestOutcomeAt
      ? Date.parse(observation.latestOutcomeAt)
      : Number.NaN
    check(
      'owner_confirmation.after_evidence',
      Number.isFinite(confirmedAt) &&
        Number.isFinite(latestOutcomeAt) &&
        confirmedAt >= latestOutcomeAt &&
        confirmedAt <= now.getTime(),
      'Owner confirmation must occur after the latest observe evidence and not in the future.',
    )
  }

  const targetControl =
    request.stage === 'promote-enforce'
      ? {
          ...control,
          mode: 'enforce' as const,
          updatedAt: now.toISOString(),
        }
      : null
  const targetControlHash = targetControl
    ? canonicalHash(targetControl)
    : input.rolloutControl.controlHash
  const generatedAt = now.toISOString()
  const reportWithoutHash: Omit<CloakCanaryRehearsalReport, 'reportHash'> = {
    schemaVersion: CLOAK_CANARY_REHEARSAL_SCHEMA_VERSION,
    stage: request.stage,
    ready: checks.every((entry) => entry.passed),
    rehearsalId,
    profileId,
    rolloutId,
    batchId,
    sourceMode: control.mode,
    targetMode: request.stage === 'promote-enforce' ? 'enforce' : 'observe',
    targetBrowserVersion: CLOAK_PILOT_BROWSER_VERSION,
    targetBinarySha256: CLOAK_PILOT_BINARY_SHA256,
    pilotConfigHash: input.pilotConfig.configHash,
    sourceControlHash: input.rolloutControl.controlHash,
    healthStateHash: input.rolloutHealth.stateHash,
    targetControlHash,
    generatedAt,
    expiresAt: new Date(now.getTime() + policy.authorizationTtlMs).toISOString(),
    ownerConfirmation,
    observation,
    checks,
    targetControl,
  }
  return {
    ...reportWithoutHash,
    reportHash: reportHash(reportWithoutHash),
  }
}

function reportPayloadSha256(report: CloakCanaryRehearsalReport): string {
  return canonicalHash(report)
}

function authorizationPayload(
  report: CloakCanaryRehearsalReport,
  signature: Omit<CloakCanaryAuthorizationSignature, 'valueBase64'>,
): Buffer {
  return Buffer.from(
    `duokai-cloak-canary-authorization-v1\n${canonicalJson({
      schemaVersion: CLOAK_CANARY_AUTHORIZATION_SCHEMA_VERSION,
      report,
      signature,
    })}`,
    'utf8',
  )
}

export async function signCloakCanaryAuthorization(
  report: CloakCanaryRehearsalReport,
  keyProvider: CloakSnapshotSigningKeyProvider,
  signedAt = new Date(),
): Promise<CloakSignedCanaryAuthorization> {
  if (!report.ready) {
    throw new CloakCanaryRehearsalError(
      'not_ready',
      'A blocked canary rehearsal report cannot be authorized.',
    )
  }
  const { reportHash: claimedHash, ...withoutHash } = report
  if (reportHash(withoutHash) !== claimedHash) {
    throw new CloakCanaryRehearsalError(
      'invalid_authorization',
      'Canary rehearsal report hash is invalid.',
    )
  }
  if (signedAt.getTime() > Date.parse(report.expiresAt)) {
    throw new CloakCanaryRehearsalError(
      'authorization_expired',
      'Canary rehearsal report expired before authorization.',
    )
  }
  let key
  try {
    key = await keyProvider.getActiveKey()
  } catch (error) {
    throw new CloakCanaryRehearsalError(
      'signing_key_unavailable',
      'Unable to load the active local canary authorization key.',
      error,
    )
  }
  const signatureWithoutValue: Omit<CloakCanaryAuthorizationSignature, 'valueBase64'> = {
    algorithm: CLOAK_CANARY_AUTHORIZATION_ALGORITHM,
    keyId: key.keyId,
    signedAt: signedAt.toISOString(),
    payloadSha256: reportPayloadSha256(report),
  }
  const valueBase64 = createHmac('sha256', key.secret)
    .update(authorizationPayload(report, signatureWithoutValue))
    .digest('base64')
  return {
    schemaVersion: CLOAK_CANARY_AUTHORIZATION_SCHEMA_VERSION,
    report,
    signature: {
      ...signatureWithoutValue,
      valueBase64,
    },
  }
}

export async function verifyCloakCanaryAuthorization(
  authorization: CloakSignedCanaryAuthorization,
  keyProvider: CloakSnapshotSigningKeyProvider,
  now = new Date(),
): Promise<CloakCanaryRehearsalReport> {
  if (
    authorization.schemaVersion !== CLOAK_CANARY_AUTHORIZATION_SCHEMA_VERSION ||
    authorization.signature.algorithm !== CLOAK_CANARY_AUTHORIZATION_ALGORITHM
  ) {
    throw new CloakCanaryRehearsalError(
      'invalid_authorization',
      'Unsupported canary authorization schema or algorithm.',
    )
  }
  const report = authorization.report
  if (!report.ready) {
    throw new CloakCanaryRehearsalError(
      'invalid_authorization',
      'Canary authorization contains a blocked report.',
    )
  }
  const { reportHash: claimedHash, ...withoutHash } = report
  if (
    reportHash(withoutHash) !== claimedHash ||
    reportPayloadSha256(report) !== authorization.signature.payloadSha256
  ) {
    throw new CloakCanaryRehearsalError(
      'invalid_authorization',
      'Canary authorization report evidence has been modified.',
    )
  }
  if (now.getTime() > Date.parse(report.expiresAt)) {
    throw new CloakCanaryRehearsalError(
      'authorization_expired',
      'Canary authorization has expired.',
    )
  }
  if (
    !validIso(authorization.signature.signedAt) ||
    Date.parse(authorization.signature.signedAt) > Date.parse(report.expiresAt)
  ) {
    throw new CloakCanaryRehearsalError(
      'invalid_authorization',
      'Canary authorization signing time is invalid.',
    )
  }
  const key = await keyProvider.getKey(authorization.signature.keyId)
  if (!key) {
    throw new CloakCanaryRehearsalError(
      'signing_key_unavailable',
      'Canary authorization signing key is unavailable.',
    )
  }
  const signatureWithoutValue: Omit<CloakCanaryAuthorizationSignature, 'valueBase64'> = {
    algorithm: authorization.signature.algorithm,
    keyId: authorization.signature.keyId,
    signedAt: authorization.signature.signedAt,
    payloadSha256: authorization.signature.payloadSha256,
  }
  const expected = createHmac('sha256', key.secret)
    .update(authorizationPayload(report, signatureWithoutValue))
    .digest()
  const actual = Buffer.from(authorization.signature.valueBase64, 'base64')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new CloakCanaryRehearsalError(
      'invalid_authorization',
      'Canary authorization signature does not match.',
    )
  }
  return report
}
