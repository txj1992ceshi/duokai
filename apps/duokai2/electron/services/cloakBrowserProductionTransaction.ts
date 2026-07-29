import type { CloakSignedTrustedIdentityRecord } from './cloakBrowserSnapshotSignature.ts'

export const DEFAULT_CLOAK_STARTUP_VERIFICATION_TIMEOUT_MS = 60_000

export type CloakProductionTransactionStage =
  | 'unverified'
  | 'delivery-preflight'
  | 'network-verification'
  | 'transport-acquisition'
  | 'browser-launch'
  | 'runtime-verification'
  | 'startup-verification'
  | 'snapshot-signing'
  | 'snapshot-persistence'
  | 'trust-publication'
  | 'trusted'
  | 'rolling-back'
  | 'rolled-back'
  | 'failed'

export type CloakProductionTransactionErrorCode =
  | 'cancelled'
  | 'stage_failed'
  | 'rollback_failed'

export class CloakProductionTransactionError extends Error {
  readonly code: CloakProductionTransactionErrorCode
  readonly failedStage: CloakProductionTransactionStage
  readonly history: CloakProductionTransactionStage[]
  readonly rollbackErrors: string[]

  constructor(input: {
    code: CloakProductionTransactionErrorCode
    message: string
    failedStage: CloakProductionTransactionStage
    history: CloakProductionTransactionStage[]
    rollbackErrors?: string[]
    cause?: unknown
  }) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause })
    this.name = 'CloakProductionTransactionError'
    this.code = input.code
    this.failedStage = input.failedStage
    this.history = [...input.history]
    this.rollbackErrors = [...(input.rollbackErrors ?? [])]
  }
}

export interface CloakDisposableResource {
  close(): Promise<void>
}

export interface CloakRollbackHandle {
  rollback(): Promise<void>
}

export interface CloakProductionTransactionContext {
  profileId: string
  deliveryReceipt?: unknown
  networkIdentity?: unknown
  transport?: CloakDisposableResource
  browser?: CloakDisposableResource
  runtimeIdentity?: unknown
  startupEvidence?: unknown
  signedRecord?: CloakSignedTrustedIdentityRecord
}

export interface CloakProductionTransactionDependencies {
  preflightDelivery(context: CloakProductionTransactionContext): Promise<unknown>
  verifyNetwork(context: CloakProductionTransactionContext): Promise<unknown>
  acquireTransport(context: CloakProductionTransactionContext): Promise<CloakDisposableResource>
  launchBrowser(context: CloakProductionTransactionContext): Promise<CloakDisposableResource>
  verifyRuntime(context: CloakProductionTransactionContext): Promise<unknown>
  verifyStartup(context: CloakProductionTransactionContext): Promise<unknown>
  buildSignedRecord(
    context: CloakProductionTransactionContext,
  ): Promise<CloakSignedTrustedIdentityRecord>
  persistSignedRecord(
    context: CloakProductionTransactionContext,
  ): Promise<CloakRollbackHandle>
  publishTrustedState(
    context: CloakProductionTransactionContext,
  ): Promise<CloakRollbackHandle>
  startupVerificationTimeoutMs?: number
  isCancelled?: () => boolean
  onTransition?: (
    stage: CloakProductionTransactionStage,
    context: Readonly<CloakProductionTransactionContext>,
  ) => void | Promise<void>
}

export interface CloakProductionSession {
  profileId: string
  status: 'trusted'
  record: CloakSignedTrustedIdentityRecord
  history: CloakProductionTransactionStage[]
  close(): Promise<{ cleanupErrors: string[] }>
}

type Compensation = {
  label: string
  run(): Promise<void>
}

async function safeTransition(
  dependencies: CloakProductionTransactionDependencies,
  stage: CloakProductionTransactionStage,
  context: CloakProductionTransactionContext,
  history: CloakProductionTransactionStage[],
): Promise<void> {
  history.push(stage)
  await dependencies.onTransition?.(stage, context)
}

function assertNotCancelled(
  dependencies: CloakProductionTransactionDependencies,
  stage: CloakProductionTransactionStage,
  history: CloakProductionTransactionStage[],
): void {
  if (dependencies.isCancelled?.()) {
    throw new CloakProductionTransactionError({
      code: 'cancelled',
      message: `Cloak production transaction was cancelled during ${stage}.`,
      failedStage: stage,
      history,
    })
  }
}

function resolveStartupVerificationTimeoutMs(
  configuredTimeoutMs: number | undefined,
): number {
  if (configuredTimeoutMs === undefined) {
    return DEFAULT_CLOAK_STARTUP_VERIFICATION_TIMEOUT_MS
  }
  if (!Number.isFinite(configuredTimeoutMs) || configuredTimeoutMs <= 0) {
    throw new Error('Cloak startup verification timeout must be a positive finite number.')
  }
  return Math.floor(configuredTimeoutMs)
}

async function runWithTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve().then(operation), timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

async function runCompensations(
  compensations: Compensation[],
): Promise<string[]> {
  const errors: string[] = []
  for (const compensation of [...compensations].reverse()) {
    try {
      await compensation.run()
    } catch (error) {
      errors.push(
        `${compensation.label}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return errors
}

async function closeRuntimeResources(
  browser: CloakDisposableResource | undefined,
  transport: CloakDisposableResource | undefined,
): Promise<string[]> {
  const errors: string[] = []
  for (const [label, resource] of [
    ['browser', browser],
    ['transport', transport],
  ] as const) {
    if (!resource) continue
    try {
      await resource.close()
    } catch (error) {
      errors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return errors
}

export async function runCloakProductionTransaction(
  profileId: string,
  dependencies: CloakProductionTransactionDependencies,
): Promise<CloakProductionSession> {
  const normalizedProfileId = String(profileId || '').trim()
  if (!normalizedProfileId) {
    throw new CloakProductionTransactionError({
      code: 'stage_failed',
      message: 'Cloak production transaction requires a profileId.',
      failedStage: 'unverified',
      history: ['unverified'],
    })
  }

  const context: CloakProductionTransactionContext = {
    profileId: normalizedProfileId,
  }
  const history: CloakProductionTransactionStage[] = []
  const mutationCompensations: Compensation[] = []
  let currentStage: CloakProductionTransactionStage = 'unverified'

  try {
    currentStage = 'delivery-preflight'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    context.deliveryReceipt = await dependencies.preflightDelivery(context)

    currentStage = 'network-verification'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    context.networkIdentity = await dependencies.verifyNetwork(context)

    currentStage = 'transport-acquisition'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    context.transport = await dependencies.acquireTransport(context)

    currentStage = 'browser-launch'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    context.browser = await dependencies.launchBrowser(context)

    currentStage = 'runtime-verification'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    context.runtimeIdentity = await dependencies.verifyRuntime(context)

    currentStage = 'startup-verification'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    const startupVerificationTimeoutMs = resolveStartupVerificationTimeoutMs(
      dependencies.startupVerificationTimeoutMs,
    )
    context.startupEvidence = await runWithTimeout(
      () => dependencies.verifyStartup(context),
      startupVerificationTimeoutMs,
      `Cloak startup verification timed out after ${startupVerificationTimeoutMs}ms.`,
    )

    currentStage = 'snapshot-signing'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    context.signedRecord = await dependencies.buildSignedRecord(context)

    currentStage = 'snapshot-persistence'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    mutationCompensations.push({
      label: 'signed snapshot persistence rollback',
      run: (await dependencies.persistSignedRecord(context)).rollback,
    })

    currentStage = 'trust-publication'
    await safeTransition(dependencies, currentStage, context, history)
    assertNotCancelled(dependencies, currentStage, history)
    mutationCompensations.push({
      label: 'trusted-state publication rollback',
      run: (await dependencies.publishTrustedState(context)).rollback,
    })

    currentStage = 'trusted'
    await safeTransition(dependencies, currentStage, context, history)
    if (!context.signedRecord) {
      throw new Error('Signed Cloak trusted identity record is missing at commit.')
    }

    let closed = false
    return {
      profileId: normalizedProfileId,
      status: 'trusted',
      record: context.signedRecord,
      history: [...history],
      close: async () => {
        if (closed) {
          return { cleanupErrors: [] }
        }
        closed = true
        return {
          cleanupErrors: await closeRuntimeResources(context.browser, context.transport),
        }
      },
    }
  } catch (error) {
    const original =
      error instanceof CloakProductionTransactionError
        ? error
        : new CloakProductionTransactionError({
            code: 'stage_failed',
            message: `Cloak production transaction failed during ${currentStage}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            failedStage: currentStage,
            history,
            cause: error,
          })

    await safeTransition(dependencies, 'rolling-back', context, history).catch(() => {
      history.push('rolling-back')
    })
    const mutationErrors = await runCompensations(mutationCompensations)
    const cleanupErrors = await closeRuntimeResources(context.browser, context.transport)
    const rollbackErrors = [...mutationErrors, ...cleanupErrors]
    await safeTransition(dependencies, 'rolled-back', context, history).catch(() => {
      history.push('rolled-back')
    })
    await safeTransition(dependencies, 'failed', context, history).catch(() => {
      history.push('failed')
    })

    throw new CloakProductionTransactionError({
      code: rollbackErrors.length > 0 ? 'rollback_failed' : original.code,
      message:
        rollbackErrors.length > 0
          ? `${original.message} Rollback errors: ${rollbackErrors.join('; ')}`
          : original.message,
      failedStage: original.failedStage,
      history,
      rollbackErrors,
      cause: original,
    })
  }
}
