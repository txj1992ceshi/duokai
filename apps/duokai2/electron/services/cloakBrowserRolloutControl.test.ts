import assert from 'node:assert/strict'
import { chmod, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from './cloakBrowserInstallPreflight.ts'
import {
  CloakRolloutControlError,
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
} from './cloakBrowserRolloutControl.ts'

async function withTempDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-rollout-'))
  try {
    await run(directory)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function controlConfig(
  patch: Partial<CloakRolloutControlConfig> = {},
): CloakRolloutControlConfig {
  return {
    ...createDefaultCloakRolloutControl(),
    mode: 'enforce',
    rolloutId: 'phase-6a-canary',
    batches: [
      {
        id: 'canary-a',
        enabled: true,
        killSwitch: false,
        profileIds: ['profile-a', 'profile-b'],
        maxConcurrentSessions: 1,
      },
    ],
    updatedAt: '2026-07-28T05:00:00.000Z',
    ...patch,
  }
}

test('missing rollout control is off and preserves Phase 5D admission semantics', async () => {
  await withTempDirectory(async (directory) => {
    const control = await readCloakRolloutControl(path.join(directory, 'rollout-control.json'))
    const health = await readCloakRolloutHealth(path.join(directory, 'rollout-health.json'))
    const decision = evaluateCloakRolloutAdmission(control, health, { profileId: 'profile-a' })

    assert.equal(control.exists, false)
    assert.equal(control.config.mode, 'off')
    assert.equal(decision.admitted, true)
    assert.equal(decision.wouldBlock, false)
    assert.equal(decision.reason, 'control_off')
  })
})

test('observe mode reports exact-batch blocks without enforcing them', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const control = await writeCloakRolloutControlAtomic(
      controlPath,
      controlConfig({ mode: 'observe' }),
    )
    const health = await readCloakRolloutHealth(path.join(directory, 'rollout-health.json'))
    const admitted = evaluateCloakRolloutAdmission(control, health, { profileId: 'profile-a' })
    const observedBlock = evaluateCloakRolloutAdmission(control, health, {
      profileId: 'profile-outside-batch',
    })

    assert.equal(admitted.reason, 'admitted')
    assert.equal(admitted.admitted, true)
    assert.equal(observedBlock.reason, 'profile_not_in_batch')
    assert.equal(observedBlock.wouldBlock, true)
    assert.equal(observedBlock.admitted, true)
    assert.equal(observedBlock.enforced, false)
    if (process.platform !== 'win32') {
      assert.equal((await stat(controlPath)).mode & 0o777, 0o600)
      assert.equal((await stat(path.dirname(controlPath))).mode & 0o777, 0o700)
    }
  })
})

test('enforce mode applies global and batch kill switches without fallback admission', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const health = await readCloakRolloutHealth(path.join(directory, 'rollout-health.json'))

    let control = await writeCloakRolloutControlAtomic(
      controlPath,
      controlConfig({ globalKillSwitch: true }),
    )
    let decision = evaluateCloakRolloutAdmission(control, health, { profileId: 'profile-a' })
    assert.equal(decision.reason, 'global_kill_switch')
    assert.equal(decision.admitted, false)

    control = await setCloakRolloutGlobalKillSwitch(
      controlPath,
      false,
      new Date('2026-07-28T05:01:00.000Z'),
    )
    control = await setCloakRolloutBatchKillSwitch(
      controlPath,
      'canary-a',
      true,
      new Date('2026-07-28T05:02:00.000Z'),
    )
    decision = evaluateCloakRolloutAdmission(control, health, { profileId: 'profile-a' })
    assert.equal(decision.reason, 'batch_kill_switch')
    assert.equal(decision.admitted, false)
  })
})

test('duplicate assignments, wildcards and target drift fail closed', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    await assert.rejects(
      writeCloakRolloutControlAtomic(
        controlPath,
        controlConfig({
          batches: [
            {
              id: 'canary-a',
              enabled: true,
              killSwitch: false,
              profileIds: ['profile-a'],
              maxConcurrentSessions: 1,
            },
            {
              id: 'canary-b',
              enabled: true,
              killSwitch: false,
              profileIds: ['profile-a'],
              maxConcurrentSessions: 1,
            },
          ],
        }),
      ),
      (error: unknown) =>
        error instanceof CloakRolloutControlError && error.code === 'invalid_control',
    )

    await assert.rejects(
      writeCloakRolloutControlAtomic(
        controlPath,
        controlConfig({
          batches: [
            {
              id: 'canary-a',
              enabled: true,
              killSwitch: false,
              profileIds: ['*'],
              maxConcurrentSessions: 1,
            },
          ],
        }),
      ),
      CloakRolloutControlError,
    )

    await assert.rejects(
      writeCloakRolloutControlAtomic(controlPath, {
        ...controlConfig(),
        targetBrowserVersion: '146.0.0.0' as typeof CLOAK_PILOT_BROWSER_VERSION,
      }),
      CloakRolloutControlError,
    )
    assert.equal(controlConfig().targetBinarySha256, CLOAK_PILOT_BINARY_SHA256)
  })
})

test('batch concurrency counts active and reserved exact Profile IDs', async () => {
  await withTempDirectory(async (directory) => {
    const control = await writeCloakRolloutControlAtomic(
      path.join(directory, 'rollout-control.json'),
      controlConfig(),
    )
    const health = await readCloakRolloutHealth(path.join(directory, 'rollout-health.json'))

    const activeBlock = evaluateCloakRolloutAdmission(control, health, {
      profileId: 'profile-a',
      activeProfileIds: ['profile-b'],
    })
    assert.equal(activeBlock.reason, 'concurrency_limit')
    assert.equal(activeBlock.activeBatchSessions, 1)
    assert.equal(activeBlock.admitted, false)

    const reservedBlock = evaluateCloakRolloutAdmission(control, health, {
      profileId: 'profile-a',
      reservedProfileIds: ['profile-b'],
    })
    assert.equal(reservedBlock.reason, 'concurrency_limit')
  })
})

test('consecutive failures open a bounded circuit and cooldown permits a probe', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const healthPath = path.join(directory, 'rollout-health.json')
    const control = await writeCloakRolloutControlAtomic(
      controlPath,
      controlConfig({
        healthPolicy: {
          sampleWindowSize: 5,
          minimumSamples: 4,
          maxFailureRate: 0.5,
          maxConsecutiveFailures: 2,
          cooldownMs: 60_000,
        },
      }),
    )
    await recordCloakRolloutOutcomeAtomic(healthPath, control, {
      profileId: 'profile-a',
      batchId: 'canary-a',
      success: false,
      reason: 'startup-failed',
      at: new Date('2026-07-28T05:00:00.000Z'),
    })
    const health = await recordCloakRolloutOutcomeAtomic(healthPath, control, {
      profileId: 'profile-a',
      batchId: 'canary-a',
      success: false,
      reason: 'startup-failed',
      at: new Date('2026-07-28T05:00:10.000Z'),
    })

    const blocked = evaluateCloakRolloutAdmission(control, health, {
      profileId: 'profile-a',
      now: new Date('2026-07-28T05:00:30.000Z'),
    })
    assert.equal(blocked.reason, 'health_circuit_open')
    assert.equal(blocked.health.consecutiveFailures, 2)
    assert.equal(blocked.admitted, false)

    const probe = evaluateCloakRolloutAdmission(control, health, {
      profileId: 'profile-a',
      now: new Date('2026-07-28T05:01:11.000Z'),
    })
    assert.equal(probe.reason, 'admitted')
    assert.equal(probe.health.circuitOpen, false)
  })
})

test('health outcomes are bounded and reset when rollout identity changes', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const healthPath = path.join(directory, 'rollout-health.json')
    let control = await writeCloakRolloutControlAtomic(
      controlPath,
      controlConfig({
        healthPolicy: {
          sampleWindowSize: 2,
          minimumSamples: 2,
          maxFailureRate: 0.5,
          maxConsecutiveFailures: 2,
          cooldownMs: 60_000,
        },
      }),
    )
    for (let index = 0; index < 3; index += 1) {
      await recordCloakRolloutOutcomeAtomic(healthPath, control, {
        profileId: 'profile-a',
        batchId: 'canary-a',
        success: index === 2,
        reason: `attempt-${index}`,
        at: new Date(`2026-07-28T05:00:0${index}.000Z`),
      })
    }
    let health = await readCloakRolloutHealth(healthPath)
    assert.equal(health.state.outcomes.length, 2)
    assert.deepEqual(
      health.state.outcomes.map((outcome) => outcome.reason),
      ['attempt-1', 'attempt-2'],
    )

    control = await writeCloakRolloutControlAtomic(controlPath, {
      ...control.config,
      rolloutId: 'phase-6a-canary-next',
      updatedAt: '2026-07-28T05:10:00.000Z',
    })
    health = await recordCloakRolloutOutcomeAtomic(healthPath, control, {
      profileId: 'profile-a',
      batchId: 'canary-a',
      success: true,
      reason: 'new-rollout',
      at: new Date('2026-07-28T05:10:01.000Z'),
    })
    assert.equal(health.state.rolloutId, 'phase-6a-canary-next')
    assert.equal(health.state.outcomes.length, 1)
  })
})

test('insecure control and health files are rejected', async () => {
  if (process.platform === 'win32') return
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    await writeFile(controlPath, JSON.stringify(controlConfig()), { mode: 0o600 })
    await chmod(controlPath, 0o644)
    await assert.rejects(
      readCloakRolloutControl(controlPath),
      (error: unknown) =>
        error instanceof CloakRolloutControlError && error.code === 'invalid_permissions',
    )
  })
})

test('off mode bypasses malformed health state to preserve Phase 5D behavior', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const healthPath = path.join(directory, 'rollout-health.json')
    await writeFile(healthPath, '{malformed-health', { mode: 0o644 })
    const governor = new CloakRolloutGovernor({ controlPath, healthPath })

    const lease = await governor.requestAdmission('profile-a')
    assert.equal(lease.decision.reason, 'control_off')
    assert.equal(lease.decision.admitted, true)
    lease.release()
  })
})

test('governor reservations close the concurrent-admission race and release idempotently', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const healthPath = path.join(directory, 'rollout-health.json')
    await writeCloakRolloutControlAtomic(controlPath, controlConfig())
    const governor = new CloakRolloutGovernor({ controlPath, healthPath })

    const first = await governor.requestAdmission('profile-a')
    assert.equal(first.decision.admitted, true)
    assert.deepEqual(governor.getReservedProfileIds(), ['profile-a'])

    const second = await governor.requestAdmission('profile-b')
    assert.equal(second.decision.reason, 'concurrency_limit')
    assert.equal(second.decision.admitted, false)

    first.release()
    first.release()
    assert.deepEqual(governor.getReservedProfileIds(), [])
    second.release()
  })
})

test('governor records an outcome at most once and always releases its reservation', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const healthPath = path.join(directory, 'rollout-health.json')
    await writeCloakRolloutControlAtomic(controlPath, controlConfig())
    const governor = new CloakRolloutGovernor({
      controlPath,
      healthPath,
      now: () => new Date('2026-07-28T06:00:00.000Z'),
    })

    const lease = await governor.requestAdmission('profile-a')
    const firstRecorded = await lease.recordFailure('runtime-verification-failed')
    const secondRecorded = await lease.recordSuccess('must-not-double-record')

    assert.equal(firstRecorded, true)
    assert.equal(secondRecorded, false)
    const health = await readCloakRolloutHealth(healthPath)
    assert.equal(health.state.outcomes.length, 1)
    assert.equal(health.state.outcomes[0]?.success, false)
    assert.equal(health.state.outcomes[0]?.reason, 'runtime-verification-failed')
    assert.deepEqual(governor.getReservedProfileIds(), [])
  })
})

test('governor serializes concurrent outcome appends without losing evidence', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const healthPath = path.join(directory, 'rollout-health.json')
    await writeCloakRolloutControlAtomic(
      controlPath,
      controlConfig({
        batches: [
          {
            id: 'canary-a',
            enabled: true,
            killSwitch: false,
            profileIds: ['profile-a', 'profile-b'],
            maxConcurrentSessions: 2,
          },
        ],
      }),
    )
    const governor = new CloakRolloutGovernor({ controlPath, healthPath })
    const first = await governor.requestAdmission('profile-a')
    const second = await governor.requestAdmission('profile-b')

    const recorded = await Promise.all([
      first.recordFailure('first-failure', new Date('2026-07-28T06:10:00.000Z')),
      second.recordSuccess('second-success', new Date('2026-07-28T06:10:01.000Z')),
    ])
    assert.deepEqual(recorded, [true, true])
    const health = await readCloakRolloutHealth(healthPath)
    assert.equal(health.state.outcomes.length, 2)
    assert.deepEqual(
      health.state.outcomes.map((outcome) => outcome.reason),
      ['first-failure', 'second-success'],
    )
  })
})

test('an in-flight session cannot write health evidence into a replacement rollout', async () => {
  await withTempDirectory(async (directory) => {
    const controlPath = path.join(directory, 'rollout-control.json')
    const healthPath = path.join(directory, 'rollout-health.json')
    const initial = await writeCloakRolloutControlAtomic(controlPath, controlConfig())
    const governor = new CloakRolloutGovernor({ controlPath, healthPath })
    const lease = await governor.requestAdmission('profile-a')

    await writeCloakRolloutControlAtomic(controlPath, {
      ...initial.config,
      rolloutId: 'phase-6a-replacement',
      updatedAt: '2026-07-28T06:20:00.000Z',
    })
    const recorded = await lease.recordFailure(
      'stale-rollout-failure',
      new Date('2026-07-28T06:20:01.000Z'),
    )

    assert.equal(recorded, false)
    const health = await readCloakRolloutHealth(healthPath)
    assert.equal(health.exists, false)
    assert.equal(health.state.outcomes.length, 0)
    assert.deepEqual(governor.getReservedProfileIds(), [])
  })
})
