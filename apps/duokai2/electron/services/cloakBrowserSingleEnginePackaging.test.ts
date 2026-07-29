import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function read(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), 'utf8')
}

test('desktop package pins only the CloakBrowser engine contract', () => {
  const packageJson = JSON.parse(read('package.json')) as {
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    build?: {
      extraResources?: unknown
      mac?: { signIgnore?: unknown }
    }
  }

  assert.equal(packageJson.dependencies?.cloakbrowser, '0.5.2')
  assert.equal(packageJson.dependencies?.['playwright-core'], '1.58.2')
  assert.equal(packageJson.dependencies?.playwright, undefined)
  assert.equal(packageJson.scripts?.['install:chromium'], undefined)
  assert.doesNotMatch(packageJson.scripts?.['prepare:desktop-assets'] ?? '', /playwright|chromium/i)
  assert.equal(packageJson.build?.extraResources, undefined)
  assert.equal(packageJson.build?.mac?.signIgnore, undefined)
})

test('production launch and proxy preflight contain no ordinary Chromium fallback', () => {
  const main = read('electron/main.ts')
  const runtime = read('electron/services/runtime.ts')
  const proxyCheck = read('electron/services/proxyCheck.ts')

  assert.doesNotMatch(main, /from ['"]playwright['"]/)
  assert.doesNotMatch(main, /chromium\.launch(?:PersistentContext)?/)
  assert.doesNotMatch(main, /buildFingerprintInitScript/)
  assert.doesNotMatch(main, /resolveChromiumExecutable/)
  assert.match(main, /cloak_single_engine_launch_blocked/)
  assert.match(main, /fallbackEngine: 'forbidden'/)

  assert.doesNotMatch(runtime, /playwright|ms-playwright|Chromium/i)
  assert.doesNotMatch(proxyCheck, /from ['"]playwright['"]|chromium\.launch/)
  assert.match(proxyCheck, /fetchJsonThroughHttpProxy/)
  assert.match(proxyCheck, /'proxy_tunnel'/)
})

test('distribution assets and user-facing guidance forbid legacy fallback', () => {
  assert.equal(existsSync(resolve(appRoot, 'build-resources/ms-playwright')), false)
  assert.equal(existsSync(resolve(appRoot, 'scripts/prepare-playwright-browsers.mjs')), false)

  const readme = read('README.md')
  const profileActions = read('src/hooks/useProfileActions.ts')
  const translations = read('src/i18n.ts')

  assert.doesNotMatch(readme, /install:chromium|- `Playwright Chromium`/i)
  assert.doesNotMatch(profileActions, /legacy browser path|原浏览器链路/i)
  assert.match(profileActions, /Single-engine mode blocks future launches/)
  assert.match(translations, /CloakBrowser/)
})
