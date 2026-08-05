import assert from 'node:assert/strict'
import test from 'node:test'

import { applyStorageStateWithoutVisibleNavigation } from './browserStorageRestore.ts'

function pageFixture() {
  const navigations: string[] = []
  const evaluated: Array<Array<{ name: string; value: string }>> = []
  let frontCount = 0
  let closed = 0
  const page = {
    goto: async (url: string) => {
      navigations.push(url)
    },
    evaluate: async <Result, Argument>(
      _callback: (argument: Argument) => Result | Promise<Result>,
      argument: Argument,
    ): Promise<Result> => {
      evaluated.push(argument as Array<{ name: string; value: string }>)
      return undefined as Result
    },
    bringToFront: async () => {
      frontCount += 1
    },
    close: async () => {
      closed += 1
    },
  }
  return {
    page,
    navigations,
    evaluated,
    get frontCount() {
      return frontCount
    },
    get closed() {
      return closed
    },
  }
}

test('restores localStorage only in a disposable background page', async () => {
  const visible = pageFixture()
  const helper = pageFixture()
  const cookies: unknown[][] = []
  const context = {
    clearCookies: async () => undefined,
    addCookies: async (value: unknown[]) => {
      cookies.push(value)
    },
    pages: () => [visible.page],
    newPage: async () => helper.page,
  }

  const result = await applyStorageStateWithoutVisibleNavigation(
    context,
    {
      cookies: [{ name: 'session', value: 'cookie' }],
      origins: [
        {
          origin: 'https://www.linkedin.com/path',
          localStorage: [
            { name: 'first', value: '1' },
            { name: 'second', value: '2' },
          ],
        },
        {
          origin: 'https://www.youtube.com/',
          localStorage: [{ name: 'third', value: '3' }],
        },
      ],
    },
    { visiblePage: visible.page },
  )

  assert.deepEqual(visible.navigations, [])
  assert.deepEqual(helper.navigations, [
    'https://www.linkedin.com',
    'https://www.youtube.com',
  ])
  assert.equal(cookies.length, 1)
  assert.equal(result.restoredOrigins, 2)
  assert.equal(result.restoredEntries, 3)
  assert.equal(result.skippedOrigins, 0)
  assert.equal(result.helperPageCreated, true)
  assert.equal(helper.closed, 1)
  assert.equal(visible.frontCount >= 3, true)
  assert.deepEqual(result.warnings, [])
})

test('skips origin import for an existing persistent profile without creating a helper tab', async () => {
  const visible = pageFixture()
  let newPageCalls = 0
  const context = {
    clearCookies: async () => undefined,
    addCookies: async () => undefined,
    pages: () => [visible.page],
    newPage: async () => {
      newPageCalls += 1
      return pageFixture().page
    },
  }

  const result = await applyStorageStateWithoutVisibleNavigation(
    context,
    {
      origins: [
        {
          origin: 'https://example.com',
          localStorage: [{ name: 'key', value: 'value' }],
        },
      ],
    },
    { restoreOrigins: false, visiblePage: visible.page },
  )

  assert.equal(result.restoredOrigins, 0)
  assert.equal(result.skippedOrigins, 1)
  assert.equal(result.helperPageCreated, false)
  assert.equal(newPageCalls, 0)
  assert.deepEqual(visible.navigations, [])
})

test('invalid origins are reported without navigating the visible page', async () => {
  const visible = pageFixture()
  const helper = pageFixture()
  const warnings: string[] = []
  const context = {
    clearCookies: async () => undefined,
    addCookies: async () => undefined,
    pages: () => [visible.page],
    newPage: async () => helper.page,
  }

  const result = await applyStorageStateWithoutVisibleNavigation(
    context,
    {
      origins: [
        {
          origin: 'file:///tmp/not-a-web-origin',
          localStorage: [{ name: 'key', value: 'value' }],
        },
      ],
    },
    {
      visiblePage: visible.page,
      onWarning: (warning) => warnings.push(warning.message),
    },
  )

  assert.equal(result.restoredOrigins, 0)
  assert.equal(result.warnings.length, 1)
  assert.equal(warnings.length, 1)
  assert.deepEqual(visible.navigations, [])
  assert.deepEqual(helper.navigations, [])
})
