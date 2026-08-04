import assert from 'node:assert/strict'
import test from 'node:test'
import type { Page } from 'playwright-core'
import {
  evaluateWithStableNavigation,
  navigateToStableStartupUrl,
} from './cloakBrowserStartupNavigation.ts'

function makePage(options: {
  initialUrl?: string
  goto?: (setUrl: (value: string) => void) => Promise<void>
  evaluate?: () => Promise<{ href: string; readyState: string }>
  waitForLoadState?: () => Promise<void>
}) {
  let currentUrl = options.initialUrl ?? 'about:blank'
  let gotoCount = 0
  let evaluateCount = 0
  let waitCount = 0
  const page = {
    goto: async () => {
      gotoCount += 1
      await options.goto?.((value) => {
        currentUrl = value
      })
    },
    url: () => currentUrl,
    waitForLoadState: async () => {
      waitCount += 1
      await options.waitForLoadState?.()
    },
    evaluate: async () => {
      evaluateCount += 1
      return options.evaluate
        ? await options.evaluate()
        : { href: currentUrl, readyState: 'complete' }
    },
  }
  return {
    page: page as unknown as Page,
    setUrl: (value: string) => {
      currentUrl = value
    },
    counts: () => ({ gotoCount, evaluateCount, waitCount }),
  }
}

test('normal startup navigation uses one goto and requires a stable document', async () => {
  const fixture = makePage({ initialUrl: 'https://www.linkedin.com/' })
  const result = await navigateToStableStartupUrl(fixture.page, 'https://www.linkedin.com/')
  assert.equal(result.success, true)
  assert.equal(result.reasonCode, 'ok')
  assert.deepEqual(fixture.counts(), { gotoCount: 1, evaluateCount: 1, waitCount: 1 })
})

test('competing chrome-error navigation fails closed without a second goto', async () => {
  const fixture = makePage({
    goto: async (setUrl) => {
      setUrl('chrome-error://chromewebdata/')
      throw new Error(
        'Navigation to "https://www.linkedin.com/" was interrupted by navigation to "chrome-error://chromewebdata/"',
      )
    },
  })
  const events: string[] = []
  const result = await navigateToStableStartupUrl(fixture.page, 'https://www.linkedin.com/', {
    onEvent: (event) => events.push(event),
  })
  assert.equal(result.success, false)
  assert.equal(result.reasonCode, 'net_error')
  assert.equal(result.finalUrl, 'chrome-error://chromewebdata/')
  assert.equal(fixture.counts().gotoCount, 1)
  assert.deepEqual(events, ['startup_navigation_competing_navigation_observed'])
})

test('competing redirect can settle successfully without issuing another goto', async () => {
  let evaluationAttempt = 0
  const fixture = makePage({
    initialUrl: 'about:blank',
    goto: async (setUrl) => {
      setUrl('https://www.linkedin.com/feed/')
      throw new Error('Navigation was interrupted by another navigation')
    },
    evaluate: async () => {
      evaluationAttempt += 1
      if (evaluationAttempt === 1) {
        throw new Error('Execution context was destroyed, most likely because of a navigation')
      }
      return { href: 'https://www.linkedin.com/feed/', readyState: 'complete' }
    },
  })
  const result = await navigateToStableStartupUrl(fixture.page, 'https://www.linkedin.com/')
  assert.equal(result.success, true)
  assert.equal(result.finalUrl, 'https://www.linkedin.com/feed/')
  assert.equal(fixture.counts().gotoCount, 1)
  assert.equal(fixture.counts().evaluateCount, 2)
})

test('preserves the original DNS classification when navigation never leaves about:blank', async () => {
  const fixture = makePage({
    initialUrl: 'about:blank',
    goto: async () => {
      throw new Error('getaddrinfo ENOTFOUND proxy.example')
    },
  })
  const result = await navigateToStableStartupUrl(fixture.page, 'https://www.linkedin.com/')
  assert.equal(result.success, false)
  assert.equal(result.reasonCode, 'dns_error')
  assert.equal(result.finalUrl, 'about:blank')
  assert.equal(fixture.counts().gotoCount, 1)
})

test('startup evaluation retries one destroyed execution context after navigation settles', async () => {
  const fixture = makePage({ initialUrl: 'https://www.linkedin.com/feed/' })
  let attempts = 0
  const value = await evaluateWithStableNavigation(fixture.page, async () => {
    attempts += 1
    if (attempts === 1) {
      throw new Error('Execution context was destroyed, most likely because of a navigation')
    }
    return 'stable'
  })
  assert.equal(value, 'stable')
  assert.equal(attempts, 2)
  assert.equal(fixture.counts().waitCount, 1)
})

test('startup evaluation does not retry unrelated application errors', async () => {
  const fixture = makePage({ initialUrl: 'https://www.linkedin.com/feed/' })
  let attempts = 0
  await assert.rejects(
    evaluateWithStableNavigation(fixture.page, async () => {
      attempts += 1
      throw new Error('fingerprint assertion failed')
    }),
    /fingerprint assertion failed/,
  )
  assert.equal(attempts, 1)
})
