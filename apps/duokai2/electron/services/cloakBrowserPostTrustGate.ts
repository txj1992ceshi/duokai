import type { CloakBrowserContextLike } from './cloakBrowserRuntime.ts'
import {
  verifyCloakContextLiveness,
  type CloakLivenessDependencies,
  type CloakLivenessEvidence,
  type CloakLivenessPolicy,
} from './cloakBrowserLiveness.ts'
import type { CloakRolloutAdmissionLease } from './cloakBrowserRolloutControl.ts'

export const DEFAULT_CLOAK_POST_TRUST_LIVENESS_POLICY = {
  minimumDurationMs: 60_000,
  sampleIntervalMs: 5_000,
  minimumSamples: 13,
} as const

export type CloakPostTrustGateStatus = 'passed' | 'failed'

export interface CloakPostTrustGateOutcome {
  profileId: string
  rolloutId: string
  batchId: string
  status: CloakPostTrustGateStatus
  success: boolean
  reason: string
  recorded: boolean
  completedAt: string
  evidence: CloakLivenessEvidence | null
  error: string
}

export interface CloakPostTrustGateOptions {
  profileId: string
  context: CloakBrowserContextLike
  lease: CloakRolloutAdmissionLease
  policy?: CloakLivenessPolicy
  livenessDependencies?: CloakLivenessDependencies
  verifyLiveness?: typeof verifyCloakContextLiveness
  now?: () => Date
}

function normalizeReason(value: string, fallback: string): string {
  const normalized = String(value || '').trim().replace(/\s+/g, '_').slice(0, 240)
  return normalized || fallback
}

export class CloakPostTrustRolloutGate {
  private readonly profileId: string
  private readonly context: CloakBrowserContextLike
  private readonly lease: CloakRolloutAdmissionLease
  private readonly policy: CloakLivenessPolicy
  private readonly livenessDependencies: CloakLivenessDependencies
  private readonly verifyLiveness: typeof verifyCloakContextLiveness
  private readonly now: () => Date
  private started = false
  private settling = false
  private outcome: CloakPostTrustGateOutcome | null = null
  private readonly completionPromise: Promise<CloakPostTrustGateOutcome>
  private resolveCompletion!: (outcome: CloakPostTrustGateOutcome) => void

  constructor(options: CloakPostTrustGateOptions) {
    this.profileId = String(options.profileId || '').trim()
    if (!this.profileId) {
      throw new Error('Cloak post-trust rollout gate requires a Profile ID.')
    }
    this.context = options.context
    this.lease = options.lease
    this.policy = {
      ...DEFAULT_CLOAK_POST_TRUST_LIVENESS_POLICY,
      ...(options.policy ?? {}),
    }
    this.livenessDependencies = options.livenessDependencies ?? {}
    this.verifyLiveness = options.verifyLiveness ?? verifyCloakContextLiveness
    this.now = options.now ?? (() => new Date())
    this.completionPromise = new Promise((resolve) => {
      this.resolveCompletion = resolve
    })
  }

  get pending(): boolean {
    return this.started && !this.outcome
  }

  get rolloutId(): string {
    return this.lease.decision.rolloutId
  }

  get batchId(): string {
    return this.lease.decision.batchId || ''
  }

  get result(): CloakPostTrustGateOutcome | null {
    return this.outcome
  }

  start(): Promise<CloakPostTrustGateOutcome> {
    if (!this.started) {
      this.started = true
      void this.run()
    }
    return this.completionPromise
  }

  async fail(reason: string, error?: unknown, at = this.now()): Promise<CloakPostTrustGateOutcome> {
    return await this.settle({
      success: false,
      reason: normalizeReason(reason, 'post_trust_liveness_failed'),
      evidence: null,
      error: error instanceof Error ? error.message : error === undefined ? '' : String(error),
      at,
    })
  }

  private async run(): Promise<void> {
    try {
      const evidence = await this.verifyLiveness(
        this.context,
        this.policy,
        {
          ...this.livenessDependencies,
          isCancelled: () =>
            Boolean(this.outcome || this.settling) ||
            Boolean(this.livenessDependencies.isCancelled?.()),
        },
      )
      await this.settle({
        success: true,
        reason: 'post_trust_liveness_passed',
        evidence,
        error: '',
        at: new Date(evidence.completedAt),
      })
    } catch (error) {
      if (this.outcome || this.settling) return
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : ''
      await this.fail(
        `post_trust_liveness_failed:${normalizeReason(code, 'probe_error')}`,
        error,
      )
    }
  }

  private async settle(input: {
    success: boolean
    reason: string
    evidence: CloakLivenessEvidence | null
    error: string
    at: Date
  }): Promise<CloakPostTrustGateOutcome> {
    if (this.outcome) return this.outcome
    if (this.settling) return await this.completionPromise
    this.settling = true

    let recorded = false
    let finalSuccess = input.success
    let finalReason = input.reason
    let writeError = input.error
    try {
      recorded = input.success
        ? await this.lease.recordSuccess(input.reason, input.at)
        : await this.lease.recordFailure(input.reason, input.at)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      writeError = writeError ? `${writeError}; rollout outcome write failed: ${message}` : message
      if (input.success) {
        finalSuccess = false
        finalReason = 'post_trust_outcome_write_failed'
      }
    }

    const outcome: CloakPostTrustGateOutcome = {
      profileId: this.profileId,
      rolloutId: this.lease.decision.rolloutId,
      batchId: this.lease.decision.batchId || '',
      status: finalSuccess ? 'passed' : 'failed',
      success: finalSuccess,
      reason: finalReason,
      recorded,
      completedAt: input.at.toISOString(),
      evidence: input.evidence,
      error: writeError,
    }
    this.outcome = outcome
    this.settling = false
    this.resolveCompletion(outcome)
    return outcome
  }
}

export type CloakLifecycleCloseClassification =
  | 'explicit-close'
  | 'browser-disconnected'
  | 'last-page-closed'
  | 'context-close-unknown'

export interface CloakLifecycleCloseDiagnosis {
  profileId: string
  classification: CloakLifecycleCloseClassification
  closeIntent: string
  launchedAt: string
  trustedAt: string
  browserDisconnectedAt: string
  lastPageClosedAt: string
  contextClosedAt: string
  lifetimeAfterTrustMs: number | null
  remainingPages: number | null
  browserConnectedAtClose: boolean | null
  processExitCodeAvailable: false
  processSignalAvailable: false
}

export interface CloakLifecycleDiagnosticsOptions {
  profileId: string
  launchedAt?: string
  now?: () => Date
}

export class CloakBrowserLifecycleDiagnostics {
  private readonly profileId: string
  private readonly now: () => Date
  private readonly launchedAt: string
  private trustedAt = ''
  private closeIntent = ''
  private browserDisconnectedAt = ''
  private lastPageClosedAt = ''
  private remainingPages: number | null = null
  private diagnosis: CloakLifecycleCloseDiagnosis | null = null

  constructor(options: CloakLifecycleDiagnosticsOptions) {
    this.profileId = String(options.profileId || '').trim()
    if (!this.profileId) {
      throw new Error('Cloak lifecycle diagnostics requires a Profile ID.')
    }
    this.now = options.now ?? (() => new Date())
    this.launchedAt = options.launchedAt || this.now().toISOString()
  }

  markTrusted(at = this.now()): void {
    if (!this.trustedAt) this.trustedAt = at.toISOString()
  }

  markCloseIntent(reason: string): void {
    if (!this.closeIntent) this.closeIntent = normalizeReason(reason, 'explicit-close')
  }

  markBrowserDisconnected(at = this.now()): void {
    if (!this.browserDisconnectedAt) this.browserDisconnectedAt = at.toISOString()
  }

  markPageClosed(remainingPages: number, at = this.now()): void {
    this.remainingPages = Math.max(0, Math.floor(remainingPages))
    if (this.remainingPages === 0 && !this.lastPageClosedAt) {
      this.lastPageClosedAt = at.toISOString()
    }
  }

  diagnoseContextClose(input: {
    at?: Date
    browserConnected?: boolean | null
    remainingPages?: number | null
  } = {}): CloakLifecycleCloseDiagnosis {
    if (this.diagnosis) return this.diagnosis
    const at = input.at ?? this.now()
    if (input.remainingPages !== undefined && input.remainingPages !== null) {
      this.markPageClosed(input.remainingPages, at)
    }
    const operatorInitiatedClose = ['stop', 'graceful-shutdown', 'launch-error'].includes(
      this.closeIntent,
    )
    const classification: CloakLifecycleCloseClassification = operatorInitiatedClose
      ? 'explicit-close'
      : this.browserDisconnectedAt
        ? 'browser-disconnected'
        : this.lastPageClosedAt
          ? 'last-page-closed'
          : this.closeIntent
            ? 'explicit-close'
            : 'context-close-unknown'
    const trustedTime = this.trustedAt ? Date.parse(this.trustedAt) : Number.NaN
    this.diagnosis = {
      profileId: this.profileId,
      classification,
      closeIntent: this.closeIntent,
      launchedAt: this.launchedAt,
      trustedAt: this.trustedAt,
      browserDisconnectedAt: this.browserDisconnectedAt,
      lastPageClosedAt: this.lastPageClosedAt,
      contextClosedAt: at.toISOString(),
      lifetimeAfterTrustMs: Number.isFinite(trustedTime)
        ? Math.max(0, at.getTime() - trustedTime)
        : null,
      remainingPages: this.remainingPages,
      browserConnectedAtClose: input.browserConnected ?? null,
      processExitCodeAvailable: false,
      processSignalAvailable: false,
    }
    return this.diagnosis
  }
}
