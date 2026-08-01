import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoRoot = resolve(appRoot, '../..')

function read(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), 'utf8')
}

function readRepo(relativePath: string): string {
  return readFileSync(resolve(repoRoot, relativePath), 'utf8')
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
  assert.equal(existsSync(resolve(appRoot, 'package-lock.json')), false)
  assert.equal(packageJson.scripts?.['install:chromium'], undefined)
  assert.doesNotMatch(packageJson.scripts?.['prepare:desktop-assets'] ?? '', /playwright|chromium/i)
  assert.equal(packageJson.build?.extraResources, undefined)
  assert.equal(packageJson.build?.mac?.signIgnore, undefined)
})

test('production launch and proxy preflight contain no ordinary Chromium fallback', () => {
  const main = read('electron/main.ts')
  const runtime = read('electron/services/runtime.ts')
  const proxyCheck = read('electron/services/proxyCheck.ts')
  const viteConfig = read('vite.config.ts')
  const cloakRuntime = read('electron/services/cloakBrowserRuntime.ts')
  const installationManager = read('electron/services/cloakBrowserInstallationManager.ts')
  const runtimeSmoke = read('scripts/run-cloak-runtime-smoke.ts')

  assert.doesNotMatch(main, /from ['"]playwright['"]/)
  assert.doesNotMatch(main, /chromium\.launch(?:PersistentContext)?/)
  assert.doesNotMatch(main, /buildFingerprintInitScript/)
  assert.doesNotMatch(main, /resolveChromiumExecutable/)
  assert.match(main, /cloak_single_engine_launch_blocked/)
  assert.match(main, /fallbackEngine: 'forbidden'/)
  assert.doesNotMatch(main, /if \(!cloakPilotEnabled &&/)
  assert.doesNotMatch(
    main,
    /evaluateTrustedSnapshotReuse|buildTrustedLaunchSnapshot|trusted_launch_quick_check_passed/,
  )

  assert.doesNotMatch(runtime, /playwright|ms-playwright|Chromium/i)
  assert.doesNotMatch(proxyCheck, /from ['"]playwright['"]|chromium\.launch/)
  assert.doesNotMatch(viteConfig, /['"]playwright['"]/)
  assert.match(proxyCheck, /fetchJsonThroughHttpProxy/)
  assert.match(proxyCheck, /'proxy_tunnel'/)
  for (const source of [cloakRuntime, installationManager, runtimeSmoke]) {
    assert.doesNotMatch(source, /DUOKAI_CLOAKBROWSER_MODULE/)
  }
  assert.match(cloakRuntime, /import\(['"]cloakbrowser['"]\)/)
  assert.match(installationManager, /import\(['"]cloakbrowser['"]\)/)
  assert.match(viteConfig, /external:\s*\[[^\]]*['"]cloakbrowser['"]/s)
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

test('official entrypoints cannot revive the retired direct Playwright runtime', () => {
  const removedPaths = [
    'apps/duokai2/electron/services/localRuntimeLauncher.ts',
    'apps/duokai2/electron/services/localRuntimeManifest.ts',
    'fingerprint-dashboard/src/lib/runtimeClient.ts',
    'fingerprint-dashboard/src/lib/localRuntimeClient.ts',
    'apps/duokai2/electron/services/cloakBrowserPostTrustProbe.ts',
    'apps/duokai2/electron/services/cloakBrowserPostTrustProbe.test.ts',
  ]
  for (const relativePath of removedPaths) {
    assert.equal(existsSync(resolve(repoRoot, relativePath)), false, relativePath)
  }

  const main = read('electron/main.ts')
  const preload = read('electron/preload.ts')
  const ipc = read('src/shared/ipc.ts')
  for (const source of [main, preload, ipc]) {
    assert.doesNotMatch(source, /ensureLocalRuntime|getLocalRuntimeInfo|stealth-engine/i)
  }

  const dashboardPage = readRepo('fingerprint-dashboard/src/app/page.tsx')
  assert.doesNotMatch(
    dashboardPage,
    /runtimeClient|NEXT_PUBLIC_RUNTIME_EXECUTION_MODE|runtime\.(?:startSession|stopSession|doSessionAction|testBrowserProxy|checkRuntimeHealth)/,
  )
  assert.match(dashboardPage, /\/api\/control-plane\/runtime/)

  const retiredActionRoute = readRepo('fingerprint-dashboard/src/app/api/runtime/[action]/route.ts')
  assert.match(retiredActionRoute, /LEGACY_DIRECT_RUNTIME_RETIRED/)
  assert.match(retiredActionRoute, /status: 410/)
  const retiredProxyRoute = readRepo('fingerprint-dashboard/src/app/api/proxy/browser-check/route.ts')
  assert.match(retiredProxyRoute, /LEGACY_BROWSER_PROXY_CHECK_RETIRED/)
  assert.match(retiredProxyRoute, /status: 410/)

  const runtimeStatusRoute = readRepo('fingerprint-dashboard/src/app/api/runtime/status/route.ts')
  assert.match(runtimeStatusRoute, /mode: 'control-plane'/)
  assert.doesNotMatch(runtimeStatusRoute, /127\.0\.0\.1:3101|runtimeUrl|RUNTIME_URL/)

  const officialEntrypoints = [
    'start.sh',
    'start_windows.bat',
    'admin_start.sh',
    'admin_start_windows.bat',
    'frontend_install_and_start.sh',
    'admin_install_and_start.sh',
    'install_windows.bat',
    'deploy/bootstrap-and-deploy.sh',
    'deploy/ecosystem.config.cjs',
    'ci/deploy.sh',
    '.github/workflows/desktop-release.yml',
    '.github/workflows/desktop-windows-smoke.yml',
    '.github/workflows/desktop-windows-test-package.yml',
  ]
  const forbiddenExecutablePattern =
    /fingerprint-dashboard[\\/]stealth-engine|playwright(?:\.cmd)?\s+install\s+chromium|npm\s+run\s+install:chromium|apps[\\/]duokai2[\\/]package-lock\.json|RUNTIME_PORT\s*=\s*3101|name\s*:\s*['"]duokai-runtime|NEXT_PUBLIC_RUNTIME_EXECUTION_MODE/i
  for (const relativePath of officialEntrypoints) {
    assert.doesNotMatch(readRepo(relativePath), forbiddenExecutablePattern, relativePath)
  }
})

test('physical legacy runtime removal cannot regress', () => {
  const removedPaths = [
    'fingerprint-dashboard/stealth-engine',
    'fingerprint-dashboard/tests/browser-scan-check.js',
    'fingerprint-dashboard/tests/concurrency-test.js',
    'fingerprint-dashboard/tests/proxy-fault-test.js',
    'fingerprint-dashboard/tests/redis-failover-clients.js',
    'fingerprint-dashboard/docker/Dockerfile',
    'duokai-api/src/lib/runtime.ts',
    'duokai-api/src/lib/runtimeProxy.ts',
    'duokai-api/src/lib/runtimeProxy.test.ts',
  ]
  for (const relativePath of removedPaths) {
    assert.equal(existsSync(resolve(repoRoot, relativePath)), false, relativePath)
  }

  const apiRuntime = readRepo('duokai-api/src/routes/runtime.ts')
  assert.match(apiRuntime, /mode: 'control-plane'/)
  assert.match(apiRuntime, /LEGACY_DIRECT_RUNTIME_RETIRED/)
  assert.match(apiRuntime, /res\.status\(410\)/)
  assert.match(apiRuntime, /AgentModel/)
  assert.doesNotMatch(apiRuntime, /getRuntimeUrl|RUNTIME_URL|runtimeUrl|\/session\/(?:start|stop|list)/)

  const apiLaunch = readRepo('duokai-api/src/routes/launch.ts')
  assert.match(apiLaunch, /LEGACY_DIRECT_LAUNCH_RETIRED/)
  assert.match(apiLaunch, /res\.status\(410\)/)
  assert.doesNotMatch(apiLaunch, /child_process|spawn\(|launch\.js|stealth-engine/)

  const dashboardLaunch = readRepo('fingerprint-dashboard/src/app/api/launch/route.ts')
  assert.match(dashboardLaunch, /LEGACY_DIRECT_LAUNCH_RETIRED/)
  assert.match(dashboardLaunch, /status: 410/)
  assert.doesNotMatch(dashboardLaunch, /child_process|spawn\(|launch\.js|stealth-engine/)

  const apiProxy = readRepo('duokai-api/src/routes/proxy.ts')
  assert.match(apiProxy, /['"]\/check['"]/)
  assert.match(apiProxy, /LEGACY_BROWSER_PROXY_CHECK_RETIRED/)
  assert.match(apiProxy, /res\.status\(410\)/)
  assert.doesNotMatch(apiProxy, /getRuntimeUrl|RUNTIME_URL|test-browser/)

  const apiHealth = readRepo('duokai-api/src/routes/health.ts')
  assert.match(apiHealth, /runtime: 'agent-managed'/)
  assert.match(apiHealth, /AgentModel/)
  assert.doesNotMatch(apiHealth, /getRuntimeUrl|RUNTIME_URL|\/health`/)

  const apiEnv = readRepo('duokai-api/.env.example')
  assert.doesNotMatch(apiEnv, /^RUNTIME_(?:URL|API_KEY)=/m)

  const rootPackage = JSON.parse(readRepo('package.json')) as {
    scripts?: Record<string, string>
  }
  assert.equal(rootPackage.scripts?.['dev:legacy-dashboard'], undefined)
  assert.equal(rootPackage.scripts?.['dev:control-dashboard'], 'npm run dev --workspace fingerprint-dashboard')
})
