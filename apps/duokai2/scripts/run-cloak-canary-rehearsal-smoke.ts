import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  evaluateCloakCanaryRehearsal,
  signCloakCanaryAuthorization,
  verifyCloakCanaryAuthorization,
} from '../electron/services/cloakBrowserCanaryRehearsal.ts'
import {
  CLOAK_PILOT_BINARY_SHA256,
  CLOAK_PILOT_BROWSER_VERSION,
} from '../electron/services/cloakBrowserInstallPreflight.ts'
import {
  CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
  readCloakPilotLocalConfig,
  writeCloakPilotLocalConfigAtomic,
} from '../electron/services/cloakBrowserPilotConfig.ts'
import {
  createDefaultCloakRolloutControl,
  readCloakRolloutControl,
  readCloakRolloutHealth,
  writeCloakRolloutControlAtomic,
  writeCloakRolloutHealthAtomic,
} from '../electron/services/cloakBrowserRolloutControl.ts'
import {
  InMemoryCloakSigningKeyProvider,
  createInMemoryCloakSigningKey,
} from '../electron/services/cloakBrowserSnapshotSignature.ts'

const now = new Date('2026-07-28T06:00:00.000Z')
const profileId = 'offline-dedicated-canary'
const rolloutId = 'phase-6b-offline-smoke'
const batchId = 'single-canary'
const directory = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-canary-smoke-'))

try {
  const pilotPath = path.join(directory, 'pilot-config.json')
  const controlPath = path.join(directory, 'rollout-control.json')
  const healthPath = path.join(directory, 'rollout-health.json')

  await writeCloakPilotLocalConfigAtomic(pilotPath, {
    schemaVersion: CLOAK_PILOT_LOCAL_CONFIG_SCHEMA_VERSION,
    defaultEnabled: false,
    enabledProfileIds: [profileId],
    disabledProfileIds: [],
    updatedAt: '2026-07-28T04:50:00.000Z',
  })
  await writeCloakRolloutControlAtomic(controlPath, {
    ...createDefaultCloakRolloutControl(),
    mode: 'observe',
    rolloutId,
    globalKillSwitch: false,
    targetBrowserVersion: CLOAK_PILOT_BROWSER_VERSION,
    targetBinarySha256: CLOAK_PILOT_BINARY_SHA256,
    batches: [
      {
        id: batchId,
        enabled: true,
        killSwitch: false,
        profileIds: [profileId],
        maxConcurrentSessions: 1,
      },
    ],
    updatedAt: '2026-07-28T04:55:00.000Z',
  })
  await writeCloakRolloutHealthAtomic(healthPath, {
    schemaVersion: 1,
    rolloutId,
    outcomes: [
      {
        profileId,
        batchId,
        success: true,
        reason: 'trusted',
        at: '2026-07-28T05:00:00.000Z',
      },
      {
        profileId,
        batchId,
        success: true,
        reason: 'trusted',
        at: '2026-07-28T05:20:00.000Z',
      },
      {
        profileId,
        batchId,
        success: true,
        reason: 'trusted',
        at: '2026-07-28T05:40:00.000Z',
      },
    ],
    updatedAt: '2026-07-28T05:40:00.000Z',
  })

  const report = evaluateCloakCanaryRehearsal({
    request: {
      stage: 'promote-enforce',
      rehearsalId: 'offline-smoke-001',
      profileId,
      rolloutId,
      batchId,
      ownerConfirmation: {
        ownerId: 'offline-project-owner',
        confirmedAt: '2026-07-28T05:50:00.000Z',
      },
    },
    pilotConfig: await readCloakPilotLocalConfig(pilotPath),
    rolloutControl: await readCloakRolloutControl(controlPath),
    rolloutHealth: await readCloakRolloutHealth(healthPath),
    runtimeState: {
      runningProfileIds: [],
      queuedProfileIds: [],
      startingProfileIds: [],
    },
    now,
  })
  if (!report.ready || report.targetControl?.mode !== 'enforce') {
    throw new Error('Offline canary rehearsal did not produce an enforce-ready report.')
  }

  const keyProvider = new InMemoryCloakSigningKeyProvider(
    createInMemoryCloakSigningKey(
      Buffer.alloc(32, 11),
      '2026-07-28T00:00:00.000Z',
    ),
  )
  const authorization = await signCloakCanaryAuthorization(report, keyProvider, now)
  const verified = await verifyCloakCanaryAuthorization(
    authorization,
    keyProvider,
    new Date('2026-07-28T06:01:00.000Z'),
  )

  console.log(
    JSON.stringify(
      {
        success: true,
        offlineOnly: true,
        browserStarted: false,
        productionControlWritten: false,
        profileId,
        rolloutId,
        batchId,
        sourceControlHash: verified.sourceControlHash,
        targetControlHash: verified.targetControlHash,
        reportHash: verified.reportHash,
        checks: verified.checks.map((check) => ({ code: check.code, passed: check.passed })),
      },
      null,
      2,
    ),
  )
} finally {
  await rm(directory, { recursive: true, force: true })
}
