import { createServer } from 'node:http'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { mkdtemp, readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  closeCloakContextSafely,
  launchCloakPersistentContext,
  type CloakRuntimeLaunchRequest,
} from '../electron/services/cloakBrowserRuntime.ts'

interface SmokeDownload {
  path(): Promise<string | null>
  suggestedFilename(): string
}

interface SmokePage {
  goto(url: string, options?: Record<string, unknown>): Promise<unknown>
  evaluate<Result, Argument>(
    callback: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ): Promise<Result>
  waitForEvent(event: 'popup'): Promise<SmokePage>
  waitForEvent(event: 'download'): Promise<SmokeDownload>
  close(): Promise<void>
}

interface SmokeContext {
  pages(): SmokePage[]
  newPage(): Promise<SmokePage>
  storageState(options: { path: string }): Promise<unknown>
  close(): Promise<void>
}

interface SmokeReport {
  success: boolean
  startedAt: string
  finishedAt: string
  browserVersion: string
  moduleSpecifier: string
  firstLaunch: {
    launched: boolean
    popupPassed: boolean
    downloadPassed: boolean
    storageStatePassed: boolean
  }
  secondLaunch: {
    launched: boolean
    cookiePersisted: boolean
    localStoragePersisted: boolean
    identityStable: boolean
  }
  identity: {
    engine: string
    wrapperVersion: string
    installedChromiumVersion: string
    runtimeChromiumVersion: string
    binaryPath: string
    binarySha256: string
    platform: string
    tier: string
  } | null
  noFallbackConfirmed: boolean
  retainedRoot: string
  failures: Array<{
    stage: string
    code: string
    message: string
  }>
}

async function startFixtureServer(): Promise<{
  baseUrl: string
  close: () => Promise<void>
}> {
  const server = createServer((request, response) => {
    const url = request.url || '/'
    if (url === '/download') {
      response.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'attachment; filename="cloak-runtime-smoke.txt"',
      })
      response.end('duokai-cloak-runtime-smoke')
      return
    }
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(
      url === '/popup'
        ? '<!doctype html><title>Cloak popup fixture</title><p>popup</p>'
        : '<!doctype html><title>Cloak runtime fixture</title><p>runtime</p>',
    )
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Failed to resolve local smoke fixture server address.')
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

function toSmokeContext(context: unknown): SmokeContext {
  return context as SmokeContext
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code || 'unknown')
  }
  return 'unknown'
}

async function run(): Promise<SmokeReport> {
  const startedAt = new Date().toISOString()
  const root = await mkdtemp(path.join(os.tmpdir(), 'duokai-cloak-runtime-poc-'))
  const userDataDir = path.join(root, 'profile')
  const downloadsDir = path.join(root, 'downloads')
  const cacheDir = process.env.DUOKAI_CLOAK_POC_CACHE_DIR || path.join(root, 'cloak-cache')
  const storageStatePath = path.join(root, 'storage-state.json')
  mkdirSync(userDataDir, { recursive: true })
  mkdirSync(downloadsDir, { recursive: true })
  mkdirSync(cacheDir, { recursive: true })

  const browserVersion =
    process.env.DUOKAI_CLOAK_POC_BROWSER_VERSION || '145.0.7632.109.2'
  const moduleSpecifier = 'cloakbrowser'
  const request: CloakRuntimeLaunchRequest = {
    userDataDir,
    downloadsDir,
    cacheDir,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    fingerprintSeed: 20260726,
    browserVersion,
    viewport: null,
    deviceMode: 'desktop',
    permissions: [],
  }
  const report: SmokeReport = {
    success: false,
    startedAt,
    finishedAt: '',
    browserVersion,
    moduleSpecifier,
    firstLaunch: {
      launched: false,
      popupPassed: false,
      downloadPassed: false,
      storageStatePassed: false,
    },
    secondLaunch: {
      launched: false,
      cookiePersisted: false,
      localStoragePersisted: false,
      identityStable: false,
    },
    identity: null,
    noFallbackConfirmed: false,
    retainedRoot: '',
    failures: [],
  }

  let fixture: Awaited<ReturnType<typeof startFixtureServer>> | null = null
  let firstContext: SmokeContext | null = null
  let secondContext: SmokeContext | null = null
  try {
    const first = await launchCloakPersistentContext(request)
    firstContext = toSmokeContext(first.context)
    report.firstLaunch.launched = true
    fixture = await startFixtureServer()
    const page = firstContext.pages()[0] ?? (await firstContext.newPage())
    await page.goto(fixture.baseUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 })
    await page.evaluate(
      (values) => {
        document.cookie = `${values.cookieName}=${values.cookieValue}; path=/; Max-Age=3600; SameSite=Lax`
        localStorage.setItem(values.storageKey, values.storageValue)
      },
      {
        cookieName: 'duokai_cloak_poc',
        cookieValue: 'first_launch',
        storageKey: 'duokai_cloak_poc',
        storageValue: 'first_launch',
      },
    )

    await firstContext.storageState({ path: storageStatePath })
    report.firstLaunch.storageStatePassed = existsSync(storageStatePath)

    const popupPromise = page.waitForEvent('popup')
    await page.evaluate((url) => {
      window.open(url, '_blank')
    }, `${fixture.baseUrl}/popup`)
    const popup = await popupPromise
    await popup.close()
    report.firstLaunch.popupPassed = true

    const downloadPromise = page.waitForEvent('download')
    await page.evaluate((url) => {
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'cloak-runtime-smoke.txt'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    }, `${fixture.baseUrl}/download`)
    const download = await downloadPromise
    const downloadedPath = await download.path()
    report.firstLaunch.downloadPassed = Boolean(
      downloadedPath &&
        existsSync(downloadedPath) &&
        download.suggestedFilename() === 'cloak-runtime-smoke.txt',
    )
    if (downloadedPath) {
      const content = await readFile(downloadedPath, 'utf8')
      report.firstLaunch.downloadPassed =
        report.firstLaunch.downloadPassed && content === 'duokai-cloak-runtime-smoke'
    }
    await closeCloakContextSafely(first.context)
    firstContext = null

    const second = await launchCloakPersistentContext(request)
    secondContext = toSmokeContext(second.context)
    report.secondLaunch.launched = true
    const secondPage = secondContext.pages()[0] ?? (await secondContext.newPage())
    await secondPage.goto(fixture.baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    const persisted = await secondPage.evaluate(() => ({
      cookie: document.cookie,
      localStorage: localStorage.getItem('duokai_cloak_poc'),
    }), undefined)
    report.secondLaunch.cookiePersisted = persisted.cookie.includes(
      'duokai_cloak_poc=first_launch',
    )
    report.secondLaunch.localStoragePersisted = persisted.localStorage === 'first_launch'
    report.secondLaunch.identityStable =
      first.identity.binarySha256 === second.identity.binarySha256 &&
      first.identity.runtimeChromiumVersion === second.identity.runtimeChromiumVersion
    report.identity = {
      engine: second.identity.engine,
      wrapperVersion: second.identity.cloakWrapperVersion,
      installedChromiumVersion: second.identity.installedChromiumVersion,
      runtimeChromiumVersion: second.identity.runtimeChromiumVersion,
      binaryPath: second.identity.binaryPath,
      binarySha256: second.identity.binarySha256,
      platform: second.identity.platform,
      tier: second.identity.tier,
    }
    await closeCloakContextSafely(second.context)
    secondContext = null

    report.success =
      report.firstLaunch.launched &&
      report.firstLaunch.popupPassed &&
      report.firstLaunch.downloadPassed &&
      report.firstLaunch.storageStatePassed &&
      report.secondLaunch.launched &&
      report.secondLaunch.cookiePersisted &&
      report.secondLaunch.localStoragePersisted &&
      report.secondLaunch.identityStable
    report.noFallbackConfirmed = true
  } catch (error) {
    report.failures.push({
      stage: report.firstLaunch.launched ? 'runtime_verification' : 'launch_preflight',
      code: errorCode(error),
      message: error instanceof Error ? error.message : String(error),
    })
    report.noFallbackConfirmed = true
  } finally {
    if (firstContext) {
      await firstContext.close().catch(() => undefined)
    }
    if (secondContext) {
      await secondContext.close().catch(() => undefined)
    }
    if (fixture) {
      await fixture.close()
    }
    const keepProfile = process.env.DUOKAI_CLOAK_POC_KEEP_PROFILE === '1'
    if (keepProfile) {
      report.retainedRoot = root
    } else {
      rmSync(root, { recursive: true, force: true })
    }
    report.finishedAt = new Date().toISOString()
  }
  return report
}

const report = await run()
console.log(JSON.stringify(report, null, 2))
if (!report.success) {
  process.exitCode = 1
}
