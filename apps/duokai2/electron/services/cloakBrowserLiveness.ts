import type { CloakBrowserContextLike } from './cloakBrowserRuntime.ts'

export const DEFAULT_CLOAK_LIVENESS_POLICY = {
  minimumDurationMs: 5_000,
  sampleIntervalMs: 1_000,
  minimumSamples: 3,
} as const

export type CloakLivenessErrorCode =
  | 'invalid_policy'
  | 'cancelled'
  | 'context_unavailable'
  | 'page_unavailable'
  | 'browser_unresponsive'

export class CloakLivenessError extends Error {
  readonly code: CloakLivenessErrorCode

  constructor(code: CloakLivenessErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.name = 'CloakLivenessError'
    this.code = code
  }
}

export interface CloakLivenessPolicy {
  minimumDurationMs?: number
  sampleIntervalMs?: number
  minimumSamples?: number
}

export interface CloakLivenessSample {
  sampledAt: string
  elapsedMs: number
  pageCount: number
  browserProduct: string
}

export interface CloakLivenessEvidence {
  passed: true
  startedAt: string
  completedAt: string
  durationMs: number
  sampleCount: number
  samples: CloakLivenessSample[]
}

export interface CloakLivenessDependencies {
  now?: () => Date
  sleep?: (durationMs: number) => Promise<void>
  isCancelled?: () => boolean
}

type ResolvedCloakLivenessPolicy = {
  minimumDurationMs: number
  sampleIntervalMs: number
  minimumSamples: number
}

function positiveInteger(value: unknown, label: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new CloakLivenessError('invalid_policy', `${label} must be a positive integer.`)
  }
  return parsed
}

function resolvePolicy(policy: CloakLivenessPolicy): ResolvedCloakLivenessPolicy {
  return {
    minimumDurationMs: positiveInteger(
      policy.minimumDurationMs ?? DEFAULT_CLOAK_LIVENESS_POLICY.minimumDurationMs,
      'minimumDurationMs',
    ),
    sampleIntervalMs: positiveInteger(
      policy.sampleIntervalMs ?? DEFAULT_CLOAK_LIVENESS_POLICY.sampleIntervalMs,
      'sampleIntervalMs',
    ),
    minimumSamples: positiveInteger(
      policy.minimumSamples ?? DEFAULT_CLOAK_LIVENESS_POLICY.minimumSamples,
      'minimumSamples',
    ),
  }
}

function defaultSleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

async function probeBrowserProcess(
  context: CloakBrowserContextLike,
): Promise<{ pageCount: number; browserProduct: string }> {
  const pages = context.pages()
  const page = pages[0]
  if (!page) {
    throw new CloakLivenessError(
      'page_unavailable',
      'Cloak sustained liveness verification requires the startup page to remain present.',
    )
  }

  let session: Awaited<ReturnType<CloakBrowserContextLike['newCDPSession']>> | null = null
  try {
    session = await context.newCDPSession(page)
    const version = await session.send('Browser.getVersion')
    const browserProduct = String(version?.product || '').trim()
    if (!browserProduct) {
      throw new Error('Browser.getVersion returned an empty product identity.')
    }
    return {
      pageCount: pages.length,
      browserProduct,
    }
  } catch (error) {
    if (error instanceof CloakLivenessError) {
      throw error
    }
    throw new CloakLivenessError(
      'browser_unresponsive',
      'Cloak browser process stopped responding during the sustained liveness window.',
      error,
    )
  } finally {
    await session?.detach?.().catch(() => undefined)
  }
}

export async function verifyCloakContextLiveness(
  context: CloakBrowserContextLike,
  policy: CloakLivenessPolicy = {},
  dependencies: CloakLivenessDependencies = {},
): Promise<CloakLivenessEvidence> {
  if (
    !context ||
    typeof context.pages !== 'function' ||
    typeof context.newCDPSession !== 'function'
  ) {
    throw new CloakLivenessError(
      'context_unavailable',
      'Cloak liveness verification requires an active persistent browser context.',
    )
  }

  const resolved = resolvePolicy(policy)
  const now = dependencies.now ?? (() => new Date())
  const sleep = dependencies.sleep ?? defaultSleep
  const isCancelled = dependencies.isCancelled ?? (() => false)
  const started = now()
  const samples: CloakLivenessSample[] = []

  while (true) {
    if (isCancelled()) {
      throw new CloakLivenessError(
        'cancelled',
        'Cloak sustained liveness verification was cancelled before trust publication.',
      )
    }

    const observed = await probeBrowserProcess(context)
    const sampledAt = now()
    const elapsedMs = Math.max(0, sampledAt.getTime() - started.getTime())
    samples.push({
      sampledAt: sampledAt.toISOString(),
      elapsedMs,
      pageCount: observed.pageCount,
      browserProduct: observed.browserProduct,
    })

    if (
      samples.length >= resolved.minimumSamples &&
      elapsedMs >= resolved.minimumDurationMs
    ) {
      return {
        passed: true,
        startedAt: started.toISOString(),
        completedAt: sampledAt.toISOString(),
        durationMs: elapsedMs,
        sampleCount: samples.length,
        samples,
      }
    }

    await sleep(resolved.sampleIntervalMs)
  }
}
