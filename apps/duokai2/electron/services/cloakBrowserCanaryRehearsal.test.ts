import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  CloakCanaryRehearsalError,
  evaluateCloakCanaryRehearsal,
  signCloakCanaryAuthorization,
  verifyCloakCanaryAuthorization,
  type CloakCanaryRehearsalRequest,
} from './cloakBrowserCanaryRehearsal.ts'
import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from './cloakBrowserInstallPreflight.ts'
import {
  readCloakPilotLocalConfig,
  writeCloakPilotLocalConfigAtomic,
} from './cloakBrowserPilotConfig.ts'
import {
  createDefaultCloakRolloutControl,
  readCloakRolloutControl,
  readCloakRolloutHealth,
  writeCloakRolloutControlAtomic,
  writeCloakRolloutHealthAtomic,
  type CloakRolloutControlConfig,
  type CloakRolloutOutcome,
} from './cloakBrowserRolloutControl.ts'
import {
  InMemoryCloakSigningKeyProvider,
  createInMemoryCloakSigningKey,
} from './cloakBrowserSnapshotSignature.ts'

const NOW = new Date('2026-07-28T06:00:00.000Z')
const PROFILE_ID = 'dedicated-canary-profile'
const ROLLOUT_ID = 'phase-6b-single-profile'
const BATCH_ID = 'single-canary'

async function withTempDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-canary-'))
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
    mode: 'observe',
    rolloutId: ROLLOUT_ID,
    globalKillSwitch: false,
    targetBrowserVersion: CLOAK_PILOT_BROWSER_VERSION,
    targetBinarySha256: CLOAK_PILOT_BINARY_SHA256,
    batches: [
      {
        id: BATCH_ID,
        enabled: true,
        killSwitch: false,
        profileIds: [PROFILE_ID],
        maxConcurrentSessions: 1,
      },
    ],
    updatedAt: '2026-07-28T04:55:00.000Z',
    ...patch,
  }
}

function successOutcomes(): CloakRolloutOutcome[] {
  return [
    {
      profileId: PROFILE_ID,
      batchId: BATCH_ID,
      success: true,
      reason: 'trusted',
      at: '2026-07-28T05:00:00.000Z',
    },
    {
      profileId: PROFILE_ID,
      batchId: BATCH_ID,
      success: true,
      reason: 'trusted',
      at: '2026-07-28T05:20:00.000Z',
    },
    {
      profileId: PROFILE_ID,
      batchId: BATCH_ID,
      success: true,
      reason: 'trusted',
      at: '2026-07-28T05:40:00.000Z',
    },
  ]
}

function request(
  patch: Partial<CloakCanaryRehearsalRequest> = {},
): CloakCanaryRehearsalRequest {
  return {
    stage: 'promote-enforce',
    rehearsalId: 'rehearsal-001',
    profileId: PROFILE_ID,
    rolloutId: ROLLOUT_ID,
    batchId: BATCH_ID,
    approval: {
      operatorId: 'operator-a',
      reviewerId: 'reviewer-b',
      approvedAt: '2026-07-28T05:50:00.000Z',
    },
    ...patch,
  }
}

async function loadFixture(
  directory: string,
  options: {
    enabledProfileIds?: string[]
    control?: CloakRolloutControlConfig
    outcomes?: CloakRolloutOutcome[]
  } = {},
) {
  const pilotPath = path.join(directory, 'pilot-config.json')
  const controlPath = path.join(directory, 'rollout-control.json')
  const healthPath = path.join(directory, 'rollout-health.json')
  await writeCloakPilotLocalConfigAtomic(pilotPath, {
    schemaVersion: 1,
    enabledProfileIds: options.enabledProfileIds ?? [PROFILE_ID],
    updatedAt: '2026-07-28T04:50:00.000Z',
  })
  await writeCloakRolloutControlAtomic(controlPath, options.control ?? controlConfig())
  if (options.outcomes) {
    await writeCloakRolloutHealthAtomic(healthPath, {
      schemaVersion: 1,
      rolloutId: ROLLOUT_ID,
      outcomes: options.outcomes,
      updatedAt: options.outcomes.at(-1)?.at ?? '',
    })
  }
  return {
    pilotConfig: await readCloakPilotLocalConfig(pilotPath),
    rolloutControl: await readCloakRolloutControl(controlPath),
    rolloutHealth: await readCloakRolloutHealth(healthPath),
  }
}

test('observe rehearsal is ready without changing control or requiring health samples', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await loadFixture(directory)
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request({ stage: 'observe', approval: undefined }),
      now: NOW,
    })

    assert.equal(report.ready, true)
    assert.equal(report.stage, 'observe')
    assert.equal(report.targetMode, 'observe')
    assert.equal(report.targetControl, null)
    assert.equal(report.targetControlHash, report.sourceControlHash)
    assert.equal(report.observation.sampleCount, 0)
  })
})

test('single-profile rehearsal blocks multiple Pilot IDs and active runtime state', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await loadFixture(directory, {
      enabledProfileIds: [PROFILE_ID, 'another-profile'],
      outcomes: successOutcomes(),
    })
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request(),
      runtimeState: { runningProfileIds: [PROFILE_ID] },
      now: NOW,
    })

    assert.equal(report.ready, false)
    assert.equal(
      report.checks.find((entry) => entry.code === 'pilot.single_profile')?.passed,
      false,
    )
    assert.equal(
      report.checks.find((entry) => entry.code === 'runtime.profile_stopped')?.passed,
      false,
    )
  })
})

test('kill switches and multi-profile batches fail closed', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await loadFixture(directory, {
      control: controlConfig({
        globalKillSwitch: true,
        batches: [
          {
            id: BATCH_ID,
            enabled: true,
            killSwitch: false,
            profileIds: [PROFILE_ID, 'another-profile'],
            maxConcurrentSessions: 2,
          },
        ],
      }),
      outcomes: successOutcomes(),
    })
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request(),
      now: NOW,
    })

    assert.equal(report.ready, false)
    assert.equal(
      report.checks.find((entry) => entry.code === 'rollout.switches_clear')?.passed,
      false,
    )
    assert.equal(
      report.checks.find((entry) => entry.code === 'rollout.single_profile_batch')?.passed,
      false,
    )
    assert.equal(
      report.checks.find((entry) => entry.code === 'rollout.admission_clean')?.passed,
      false,
    )
  })
})

test('promotion requires bounded successful observation evidence and separated approval', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await loadFixture(directory, { outcomes: successOutcomes() })
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request(),
      now: NOW,
    })

    assert.equal(report.ready, true)
    assert.equal(report.observation.sampleCount, 3)
    assert.equal(report.observation.successCount, 3)
    assert.equal(report.observation.failureCount, 0)
    assert.equal(report.observation.durationMs, 40 * 60 * 1000)
    assert.equal(report.targetControl?.mode, 'enforce')
    assert.equal(report.targetControl?.batches[0]?.profileIds[0], PROFILE_ID)
    assert.notEqual(report.targetControlHash, report.sourceControlHash)
  })
})

test('insufficient evidence and same-person approval block promotion', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await loadFixture(directory, { outcomes: successOutcomes().slice(0, 2) })
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request({
        approval: {
          operatorId: 'same-person',
          reviewerId: 'same-person',
          approvedAt: '2026-07-28T05:50:00.000Z',
        },
      }),
      now: NOW,
    })

    assert.equal(report.ready, false)
    assert.equal(
      report.checks.find((entry) => entry.code === 'observation.minimum_successes')?.passed,
      false,
    )
    assert.equal(
      report.checks.find((entry) => entry.code === 'approval.separation')?.passed,
      false,
    )
  })
})

test('failed or stale latest evidence blocks enforce promotion', async () => {
  await withTempDirectory(async (directory) => {
    const outcomes = successOutcomes()
    outcomes.push({
      profileId: PROFILE_ID,
      batchId: BATCH_ID,
      success: false,
      reason: 'network-mismatch',
      at: '2026-07-28T05:41:00.000Z',
    })
    const fixture = await loadFixture(directory, { outcomes })
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request({
        approval: {
          operatorId: 'operator-a',
          reviewerId: 'reviewer-b',
          approvedAt: '2026-07-28T05:50:00.000Z',
        },
      }),
      policy: { maximumLatestSampleAgeMs: 5 * 60 * 1000 },
      now: NOW,
    })

    assert.equal(report.ready, false)
    assert.equal(
      report.checks.find((entry) => entry.code === 'observation.failure_budget')?.passed,
      false,
    )
    assert.equal(
      report.checks.find((entry) => entry.code === 'observation.latest_success')?.passed,
      false,
    )
    assert.equal(
      report.checks.find((entry) => entry.code === 'observation.latest_fresh')?.passed,
      false,
    )
  })
})

test('ready promotion report can be signed and verified with a local key', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await loadFixture(directory, { outcomes: successOutcomes() })
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request(),
      now: NOW,
    })
    const provider = new InMemoryCloakSigningKeyProvider(
      createInMemoryCloakSigningKey(
        Buffer.alloc(32, 7),
        '2026-07-28T00:00:00.000Z',
      ),
    )
    const authorization = await signCloakCanaryAuthorization(
      report,
      provider,
      new Date('2026-07-28T06:01:00.000Z'),
    )
    const verified = await verifyCloakCanaryAuthorization(
      authorization,
      provider,
      new Date('2026-07-28T06:02:00.000Z'),
    )

    assert.equal(verified.reportHash, report.reportHash)
    assert.equal(verified.targetControlHash, report.targetControlHash)
  })
})

test('tampered and expired canary authorizations are rejected', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await loadFixture(directory, { outcomes: successOutcomes() })
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request(),
      policy: { authorizationTtlMs: 60_000 },
      now: NOW,
    })
    const provider = new InMemoryCloakSigningKeyProvider(
      createInMemoryCloakSigningKey(Buffer.alloc(32, 9)),
    )
    const authorization = await signCloakCanaryAuthorization(report, provider, NOW)
    const tampered = structuredClone(authorization)
    tampered.report.targetControlHash = '0'.repeat(64)

    await assert.rejects(
      verifyCloakCanaryAuthorization(tampered, provider, NOW),
      (error: unknown) =>
        error instanceof CloakCanaryRehearsalError &&
        error.code === 'invalid_authorization',
    )
    await assert.rejects(
      verifyCloakCanaryAuthorization(
        authorization,
        provider,
        new Date('2026-07-28T06:01:01.000Z'),
      ),
      (error: unknown) =>
        error instanceof CloakCanaryRehearsalError &&
        error.code === 'authorization_expired',
    )
  })
})

test('blocked rehearsal report cannot be signed', async () => {
  await withTempDirectory(async (directory) => {
    const fixture = await loadFixture(directory)
    const report = evaluateCloakCanaryRehearsal({
      ...fixture,
      request: request(),
      now: NOW,
    })
    const provider = new InMemoryCloakSigningKeyProvider()

    assert.equal(report.ready, false)
    await assert.rejects(
      signCloakCanaryAuthorization(report, provider, NOW),
      (error: unknown) =>
        error instanceof CloakCanaryRehearsalError && error.code === 'not_ready',
    )
  })
})
