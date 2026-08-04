import type { Page } from 'playwright-core'
import type {
  StartupNavigationReasonCode,
  StartupNavigationResult,
} from '../../src/shared/types'

export type StartupNavigationAudit = (
  event: string,
  detail: Record<string, unknown>,
) => void

interface StartupDocumentState {
  href: string
  readyState: string
}

const INTERNAL_ERROR_URL_PATTERN = /^(?:chrome-error|edge-error|about:neterror):/i
const NAVIGATION_TRANSITION_PATTERN =
  /navigation .*interrupted|interrupted by another navigation|execution context was destroyed|cannot find context with specified id|most likely because of a navigation/i

export function classifyStartupNavigationError(error: unknown): StartupNavigationReasonCode {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  if (message.includes('timeout') || message.includes('timed out')) return 'timeout'
  if (message.includes('dns') || message.includes('enotfound') || message.includes('eai_again')) {
    return 'dns_error'
  }
  if (message.includes('ssl') || message.includes('tls') || message.includes('certificate')) {
    return 'tls_error'
  }
  if (message.includes('proxy')) return 'proxy_error'
  if (message.includes('redirect') || NAVIGATION_TRANSITION_PATTERN.test(message)) {
    return 'redirect_unstable'
  }
  if (
    message.includes('blocked') ||
    message.includes('forbidden') ||
    message.includes('denied') ||
    message.includes('access denied')
  ) {
    return 'page_blocked'
  }
  if (message.includes('challenge') || message.includes('captcha') || message.includes('verify')) {
    return 'challenge_or_gate'
  }
  if (
    message.includes('net::') ||
    message.includes('connection') ||
    message.includes('socket') ||
    message.includes('network') ||
    message.includes('chrome-error://')
  ) {
    return 'net_error'
  }
  return 'unknown'
}

export function isNavigationTransitionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return NAVIGATION_TRANSITION_PATTERN.test(message)
}

function isInternalErrorUrl(value: string): boolean {
  return INTERNAL_ERROR_URL_PATTERN.test(value.trim())
}

function failureResult(
  requestedUrl: string,
  checkedAt: string,
  finalUrl: string,
  reasonCode: StartupNavigationReasonCode,
  message: string,
): StartupNavigationResult {
  return {
    requestedUrl,
    attemptedUrl: requestedUrl,
    finalUrl,
    success: false,
    reasonCode,
    message,
    checkedAt,
  }
}

async function waitForCompetingNavigation(page: Page, timeoutMs: number): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: timeoutMs }).catch(() => undefined)
}

async function inspectStableDocument(
  page: Page,
  requestedUrl: string,
  checkedAt: string,
  timeoutMs: number,
  onEvent?: StartupNavigationAudit,
): Promise<StartupNavigationResult> {
  let lastError: unknown = null
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const visibleUrl = page.url()
    if (isInternalErrorUrl(visibleUrl)) {
      return failureResult(
        requestedUrl,
        checkedAt,
        visibleUrl,
        'net_error',
        `Startup navigation resolved to internal browser error page: ${visibleUrl}`,
      )
    }
    try {
      const state = await page.evaluate<StartupDocumentState>(() => {
        const browserGlobal = globalThis as unknown as {
          location: { href: string }
          document: { readyState: string }
        }
        return {
          href: browserGlobal.location.href,
          readyState: browserGlobal.document.readyState,
        }
      })
      const finalUrl = state.href || page.url()
      if (isInternalErrorUrl(finalUrl)) {
        return failureResult(
          requestedUrl,
          checkedAt,
          finalUrl,
          'net_error',
          `Startup navigation resolved to internal browser error page: ${finalUrl}`,
        )
      }
      if (!/^https?:\/\//i.test(finalUrl)) {
        return failureResult(
          requestedUrl,
          checkedAt,
          finalUrl,
          'redirect_unstable',
          `Startup navigation did not settle on an HTTP(S) document: ${finalUrl || '(empty)'}`,
        )
      }
      if (state.readyState === 'loading') {
        onEvent?.('startup_navigation_document_loading', { attempt, finalUrl })
        await waitForCompetingNavigation(page, timeoutMs)
        continue
      }
      return {
        requestedUrl,
        attemptedUrl: requestedUrl,
        finalUrl,
        success: true,
        reasonCode: 'ok',
        message:
          attempt === 1
            ? 'Startup page reached a stable document'
            : 'Startup page reached a stable document after navigation context recovery',
        checkedAt,
      }
    } catch (error) {
      lastError = error
      if (attempt === 1 && isNavigationTransitionError(error)) {
        onEvent?.('startup_navigation_context_recovery', {
          attempt,
          finalUrl: page.url(),
          error: error instanceof Error ? error.message : String(error),
        })
        await waitForCompetingNavigation(page, timeoutMs)
        continue
      }
      break
    }
  }
  const finalUrl = page.url()
  return failureResult(
    requestedUrl,
    checkedAt,
    finalUrl,
    classifyStartupNavigationError(lastError),
    lastError instanceof Error
      ? lastError.message
      : 'Startup document did not become stable after bounded navigation recovery',
  )
}

export async function navigateToStableStartupUrl(
  page: Page,
  startupUrl: string,
  options: {
    timeoutMs?: number
    settleTimeoutMs?: number
    now?: () => Date
    onEvent?: StartupNavigationAudit
  } = {},
): Promise<StartupNavigationResult> {
  const checkedAt = (options.now ?? (() => new Date()))().toISOString()
  const timeoutMs = options.timeoutMs ?? 20_000
  const settleTimeoutMs = options.settleTimeoutMs ?? 10_000
  let navigationError: unknown = null

  try {
    await page.goto(startupUrl, { waitUntil: 'commit', timeout: timeoutMs })
  } catch (error) {
    navigationError = error
    options.onEvent?.(
      isNavigationTransitionError(error)
        ? 'startup_navigation_competing_navigation_observed'
        : 'startup_navigation_signal_failed',
      {
        startupUrl,
        finalUrl: page.url(),
        error: error instanceof Error ? error.message : String(error),
      },
    )
  }

  await waitForCompetingNavigation(page, settleTimeoutMs)
  const result = await inspectStableDocument(
    page,
    startupUrl,
    checkedAt,
    settleTimeoutMs,
    options.onEvent,
  )
  if (result.success && navigationError) {
    return {
      ...result,
      message: isNavigationTransitionError(navigationError)
        ? 'Startup page stabilized after a competing navigation without issuing a second goto'
        : 'Startup page stabilized after a non-fatal navigation signal',
    }
  }
  if (
    !result.success &&
    navigationError &&
    (result.reasonCode === 'unknown' || result.finalUrl === 'about:blank' || result.finalUrl === '')
  ) {
    return {
      ...result,
      reasonCode: classifyStartupNavigationError(navigationError),
      message: navigationError instanceof Error ? navigationError.message : String(navigationError),
    }
  }
  return result
}

export async function evaluateWithStableNavigation<T>(
  page: Page,
  operation: () => Promise<T>,
  options: { settleTimeoutMs?: number; onEvent?: StartupNavigationAudit } = {},
): Promise<T> {
  const settleTimeoutMs = options.settleTimeoutMs ?? 10_000
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === 1 && isNavigationTransitionError(error)) {
        options.onEvent?.('startup_evaluation_context_recovery', {
          attempt,
          finalUrl: page.url(),
          error: error instanceof Error ? error.message : String(error),
        })
        await waitForCompetingNavigation(page, settleTimeoutMs)
        const finalUrl = page.url()
        if (isInternalErrorUrl(finalUrl)) {
          throw new Error(`Startup evaluation blocked by internal browser error page: ${finalUrl}`, {
            cause: error,
          })
        }
        continue
      }
      throw error
    }
  }
  throw new Error('Startup evaluation failed after bounded navigation recovery')
}
