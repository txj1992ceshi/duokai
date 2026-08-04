import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from '../electron/services/cloakBrowserInstallPreflight.ts'
import {
  CloakRolloutGovernor,
  createDefaultCloakRolloutControl,
  evaluateCloakRolloutAdmission,
  readCloakRolloutControl,
  readCloakRolloutHealth,
  recordCloakRolloutOutcomeAtomic,
  setCloakRolloutBatchKillSwitch,
  setCloakRolloutGlobalKillSwitch,
  writeCloakRolloutControlAtomic,
  type CloakRolloutControlConfig,
} from '../electron/services/cloakBrowserRolloutControl.ts'

const startedAt = new Date().toISOString()
const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-phase6a-'))
const controlPath = path.join(root, 'cloak-pilot', 'rollout-control.json')
const healthPath = path.join(root, 'cloak-pilot', 'rollout-health.json')

try {
  const missingControl = await readCloakRolloutControl(controlPath)
  const missingHealth = await readCloakRolloutHealth(healthPath)
  const offDecision = evaluateCloakRolloutAdmission(missingControl, missingHealth, {
    profileId: 'phase6a-profile-a',
  })

  const base: CloakRolloutControlConfig = {
    ...createDefaultCloakRolloutControl(),
    mode: 'observe',
    rolloutId: 'phase-6a-smoke',
    globalKillSwitch: true,
    targetBrowserVersion: CLOAK_PILOT_BROWSER_VERSION,
    targetBinarySha256: CLOAK_PILOT_BINARY_SHA256,
    batches: [
      {
        id: 'canary-a',
        enabled: true,
        killSwitch: false,
        profileIds: ['phase6a-profile-a', 'phase6a-profile-b'],
        maxConcurrentSessions: 1,
      },
    ],
    healthPolicy: {
      sampleWindowSize: 5,
      minimumSamples: 3,
      maxFailureRate: 0.5,
      maxConsecutiveFailures: 2,
      cooldownMs: 60_000,
    },
    updatedAt: '2026-07-28T06:00:00.000Z',
  }
  let control = await writeCloakRolloutControlAtomic(controlPath, base)
  const observeDecision = evaluateCloakRolloutAdmission(control, missingHealth, {
    profileId: 'phase6a-profile-a',
  })

  control = await setCloakRolloutGlobalKillSwitch(
    controlPath,
    false,
    new Date('2026-07-28T06:01:00.000Z'),
  )
  control = await writeCloakRolloutControlAtomic(controlPath, {
    ...control.config,
    mode: 'enforce',
    updatedAt: '2026-07-28T06:02:00.000Z',
  })

  const governor = new CloakRolloutGovernor({ controlPath, healthPath })
  const firstLease = await governor.requestAdmission('phase6a-profile-a')
  const concurrentLease = await governor.requestAdmission('phase6a-profile-b')
  firstLease.release()
  concurrentLease.release()

  await recordCloakRolloutOutcomeAtomic(healthPath, control, {
    profileId: 'phase6a-profile-a',
    batchId: 'canary-a',
    success: false,
    reason: 'runtime-verification-failed',
    at: new Date('2026-07-28T06:03:00.000Z'),
  })
  const unhealthy = await recordCloakRolloutOutcomeAtomic(healthPath, control, {
    profileId: 'phase6a-profile-a',
    batchId: 'canary-a',
    success: false,
    reason: 'startup-verification-failed',
    at: new Date('2026-07-28T06:03:10.000Z'),
  })
  const circuitDecision = evaluateCloakRolloutAdmission(control, unhealthy, {
    profileId: 'phase6a-profile-a',
    now: new Date('2026-07-28T06:03:30.000Z'),
  })

  control = await setCloakRolloutBatchKillSwitch(
    controlPath,
    'canary-a',
    true,
    new Date('2026-07-28T06:04:00.000Z'),
  )
  const batchKillDecision = evaluateCloakRolloutAdmission(control, unhealthy, {
    profileId: 'phase6a-profile-a',
    now: new Date('2026-07-28T06:04:01.000Z'),
  })

  const controlMode = process.platform === 'win32' ? null : (await stat(controlPath)).mode & 0o777
  const healthMode = process.platform === 'win32' ? null : (await stat(healthPath)).mode & 0o777
  const checks = {
    defaultOffPreserved: offDecision.admitted && offDecision.reason === 'control_off',
    observeDoesNotBlock:
      observeDecision.admitted &&
      observeDecision.wouldBlock &&
      observeDecision.reason === 'global_kill_switch',
    enforceAdmitsExactBatch: firstLease.decision.admitted,
    concurrentStartBlocked:
      !concurrentLease.decision.admitted && concurrentLease.decision.reason === 'concurrency_limit',
    healthCircuitBlocked:
      !circuitDecision.admitted && circuitDecision.reason === 'health_circuit_open',
    batchKillBlocked:
      !batchKillDecision.admitted && batchKillDecision.reason === 'batch_kill_switch',
    privateFiles:
      process.platform === 'win32' || (controlMode === 0o600 && healthMode === 0o600),
    pinnedIdentity:
      control.config.targetBrowserVersion === CLOAK_PILOT_BROWSER_VERSION &&
      control.config.targetBinarySha256 === CLOAK_PILOT_BINARY_SHA256,
  }
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  const result = {
    success: failures.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    root,
    checks,
    decisions: {
      off: offDecision,
      observe: observeDecision,
      concurrent: concurrentLease.decision,
      circuit: circuitDecision,
      batchKill: batchKillDecision,
    },
    files: {
      controlPath,
      healthPath,
      controlMode: controlMode === null ? 'windows-acl' : controlMode.toString(8),
      healthMode: healthMode === null ? 'windows-acl' : healthMode.toString(8),
    },
    failures,
  }
  console.log(JSON.stringify(result, null, 2))
  if (!result.success) process.exitCode = 1
} finally {
  await rm(root, { recursive: true, force: true })
}
