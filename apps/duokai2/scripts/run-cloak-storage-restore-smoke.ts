import { createServer } from 'node:http'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { applyStorageStateWithoutVisibleNavigation } from '../electron/services/browserStorageRestore.ts'
import {
  closeCloakContextSafely,
  launchCloakPersistentContext,
  type CloakRuntimeLaunchRequest,
} from '../electron/services/cloakBrowserRuntime.ts'

async function startFixture() {
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(request.url || '/')
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end('<!doctype html><title>Storage restore target</title><p>target</p>')
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to resolve fixture address.')
  }
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

async function run() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-storage-restore-smoke-'))
  const userDataDir = path.join(root, 'profile')
  const downloadsDir = path.join(root, 'downloads')
  await mkdir(userDataDir, { recursive: true })
  await mkdir(downloadsDir, { recursive: true })
  const fixture = await startFixture()
  const request: CloakRuntimeLaunchRequest = {
    userDataDir,
    downloadsDir,
    cacheDir: process.env.DUOKAI_CLOAK_POC_CACHE_DIR || path.join(os.homedir(), '.cloakbrowser'),
    locale: 'en-US',
    timezoneId: 'UTC',
    fingerprintSeed: 20260805,
    browserVersion: '145.0.7632.109.2',
    viewport: null,
    deviceMode: 'desktop',
    permissions: [],
  }

  let context: Awaited<ReturnType<typeof launchCloakPersistentContext>>['context'] | null = null
  try {
    const launched = await launchCloakPersistentContext(request)
    context = launched.context
    const page = context.pages()[0] ?? (await context.newPage())
    const initialUrl = page.url()
    const visibleNavigations: string[] = []
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) visibleNavigations.push(frame.url())
    })

    const restore = await applyStorageStateWithoutVisibleNavigation(
      context,
      {
        origins: [
          {
            origin: `${fixture.origin}/historical-path`,
            localStorage: [{ name: 'duokai_hidden_restore', value: 'restored' }],
          },
        ],
      },
      { visiblePage: page },
    )
    const requestsBeforeTarget = [...fixture.requests]
    const urlAfterRestore = page.url()

    await page.goto(`${fixture.origin}/target`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    const restoredValue = await page.evaluate(() =>
      localStorage.getItem('duokai_hidden_restore'),
    )

    const report = {
      success:
        restore.restoredOrigins === 1 &&
        restore.restoredEntries === 1 &&
        requestsBeforeTarget.length >= 1 &&
        urlAfterRestore === initialUrl &&
        restoredValue === 'restored' &&
        context.pages().length === 1 &&
        visibleNavigations.filter((url) => /^https?:/i.test(url)).length === 1,
      initialUrl,
      urlAfterRestore,
      restoredValue,
      restore,
      requestsBeforeTarget,
      requestsAfterTarget: fixture.requests,
      remainingPageCount: context.pages().length,
      visibleNavigations,
      identity: {
        browserVersion: launched.identity.runtimeChromiumVersion,
        binarySha256: launched.identity.binarySha256,
      },
    }
    console.log(JSON.stringify(report, null, 2))
    if (!report.success) process.exitCode = 1
  } finally {
    if (context) await closeCloakContextSafely(context).catch(() => undefined)
    await fixture.close()
    await rm(root, { recursive: true, force: true })
  }
}

await run()
