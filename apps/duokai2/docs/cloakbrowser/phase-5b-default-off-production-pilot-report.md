# Duokai CloakBrowser Phase 5B Default-Off Production Pilot Report

**Date:** 2026-07-27
**Workspace:** `~/Documents/duokai-cloakbrowser-phase1-poc`
**Branch:** `codex/cloakbrowser-phase1-poc`
**Status:** Passed as a default-off production-pilot integration with real runtime and packaged-infrastructure validation; not activated for a persisted Duokai profile

## Scope

Phase 5B connects the Phase 1–5A CloakBrowser sidecar implementation to the formal Electron launch lifecycle under a strict, default-off Pilot gate.

The implementation adds:

- exact test-profile eligibility;
- fixed-version and SHA256 installation preflight;
- launch-owned proxy bridge leases and reference counting;
- real packaged Electron `safeStorage` validation;
- transactional Cloak launch orchestration;
- formal launch-path integration without a Chromium fallback;
- process, context-close and failure cleanup;
- a packaged diagnostic entry point that runs before database initialization;
- a minimized package-lock update for the Cloak dependencies.

The Pilot remains disabled unless all explicit gates are satisfied. No commit, merge, push, remote change or global configuration change was performed.

## Default-off eligibility

A profile enters the Cloak Pilot only when all three conditions are true:

```text
DUOKAI_CLOAK_PILOT_ENABLED=1
DUOKAI_CLOAK_PILOT_PROFILE_IDS=<exact comma-separated profile IDs>
profile.tags contains cloak-pilot-test
```

Additional protections:

- an empty allowlist disables the Pilot;
- `*` is discarded and cannot enable every profile;
- an allowlisted profile without the exact test tag remains on the legacy path;
- a tagged profile without the global flag remains on the legacy path;
- the eligibility decision is written to the audit log.

The legacy Playwright Chromium path remains the default behavior.

## Formal launch integration

When the Pilot gate is disabled, the existing launch sequence continues to use the existing Playwright Chromium flow and legacy trusted snapshot behavior.

When the Pilot gate is enabled, the formal launch flow enters the Phase 5A transaction before any trust is published:

```text
delivery-preflight
network-verification
transport-acquisition
browser-launch
runtime-verification
startup-verification
snapshot-signing
snapshot-persistence
trust-publication
trusted
```

The Pilot branch returns before the legacy `buildFingerprintInitScript` / `addInitScript` call. Native Cloak fingerprint mapping therefore owns the Pilot browser identity.

The Pilot path has no ordinary Chromium fallback. Missing binaries, version drift, SHA drift, network identity failure, startup verification failure, signing failure or trust-publication failure close resources and fail the launch.

## Proxy bridge lifecycle

The production proxy bridge now uses a generic reference-counted asynchronous resource pool.

Each launch or proxy check receives an idempotent lease:

```text
acquire -> reference count +1
release -> reference count -1
zero references -> destroy active sockets and close listener
```

Cleanup is connected to:

- proxy-check completion;
- legacy runtime context close;
- legacy launch failure;
- Cloak transaction rollback;
- Cloak context close;
- graceful process shutdown.

The legacy `resolveLaunchProxy` API remains available for compatibility and is released by the process-level close-all operation.

## Fixed-version installation preflight

The Pilot requires:

```text
wrapperVersion=0.5.2
browserVersion=145.0.7632.109.2
executableVersion=145.0.7632.109
releaseChannel=stable
launchAutoDownload=false
fallbackEngine=forbidden
```

The preflight validates:

- absolute managed cache root outside the app, resources and OS temporary directory;
- wrapper descriptor version, platform and tier;
- the version-specific cache directory under the configured cache root;
- executable placement inside that version directory;
- installed and executable status;
- executable `--version` result;
- exact binary SHA256.

Real validation discovered and fixed a path-contract defect in the original test fixture: Cloak wrapper `binaryInfo.cacheDir` reports the version directory, while the Pilot configuration supplies the cache root. The final implementation validates the expected version directory beneath that root.

Real preflight receipt:

```text
engine=cloakbrowser
wrapperVersion=0.5.2
browserVersion=145.0.7632.109.2
executableChromiumVersion=145.0.7632.109
platform=darwin-arm64
tier=free
cacheDir=~/.cloakbrowser
binaryPath=~/.cloakbrowser/chromium-145.0.7632.109.2/Chromium.app/Contents/MacOS/Chromium
binarySha256=79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79
launchAutoDownload=false
fallbackEngine=forbidden
```

## Real Cloak runtime smoke

The real installed Cloak Chromium was launched twice through `launchCloakPersistentContext` using a disposable profile and local HTTP fixture.

Result:

```text
success=true
firstLaunch.launched=true
firstLaunch.popupPassed=true
firstLaunch.downloadPassed=true
firstLaunch.storageStatePassed=true
secondLaunch.launched=true
secondLaunch.cookiePersisted=true
secondLaunch.localStoragePersisted=true
secondLaunch.identityStable=true
noFallbackConfirmed=true
failures=[]
```

Observed identity:

```text
engine=cloakbrowser
wrapperVersion=0.5.2
installedChromiumVersion=145.0.7632.109.2
runtimeChromiumVersion=145.0.7632.109
platform=darwin-arm64
tier=free
binarySha256=79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79
```

The disposable smoke profile was removed after completion.

## Real packaged Electron diagnostic

A directory-form macOS arm64 app was built and launched in diagnostic mode before database initialization. All files were placed under the actual macOS user temporary directory.

`safeStorage` result:

```text
encryptionAvailable=true
selectedBackend=platform-default
keyStableAcrossReload=true
sealedKeyMode=600
plaintextSecretAbsent=true
```

Proxy bridge result:

```text
sameEndpointAcrossLeases=true
listenerReachableBeforeRelease=true
referencesAtPeak=2
referencesAfterFirstRelease=1
activeBridgesAfterFinalRelease=0
listenerClosedAfterFinalRelease=true
failures=[]
```

The diagnostic accepts either an explicit environment switch or the dedicated command-line form:

```text
--duokai-cloak-packaged-diagnostic
--duokai-cloak-packaged-diagnostic-root=<absolute OS-temp path>
--duokai-cloak-packaged-diagnostic-output=<absolute OS-temp JSON path>
```

It refuses non-packaged execution or paths outside the OS temporary directory.

## Tests and build

Final verification:

```text
Combined Cloak tests:             83/83 passed
Install preflight targeted tests: 5/5 passed
TypeScript main-process check:    passed
git diff --check:                 passed
Real Cloak persistent smoke:      passed
Real binary install preflight:    passed
Electron macOS arm64 build:dir:   passed
Packaged safeStorage diagnostic:  passed
Packaged proxy bridge diagnostic: passed
Final ASAR audit:                 passed
```

The macOS directory build used ad-hoc signing. Notarization remains explicitly disabled by the existing build configuration.

## Final ASAR audit

```text
asarBytes=62216483
fileCount=6745
containsMain=true
containsPackage=true
containsCloakWrapper=true
containsPlaywrightCore=true
mainHasPilotGate=true
mainHasPackagedDiagnostic=true
mainHasNoFallbackPolicy=true
mainHasVersionDirectoryContractFix=true
containsPinnedCloakBinary=false
externalCloakBinaryBundled=false
packageCloakVersion=0.5.2
packagePlaywrightCoreVersion=1.58.2
```

The legacy Playwright browser resources remain packaged because the default production path is intentionally unchanged. The fixed Cloak Chromium remains an externally managed cache asset and is not copied into the app bundle.

## Dependency lock scope

The initial npm workspace refresh introduced unrelated `duokai-web` entries and broad dependency relocation. The final lock file was rebuilt from the Git baseline and contains only the Duokai2/Cloak changes required by this phase.

Validated lock nodes:

```text
cloakbrowser=0.5.2
playwright-core=1.58.2
tar=7.5.22
@isaacs/fs-minipass=4.0.1
chownr=3.0.0
minipass=7.1.3
minizlib=3.1.0
yallist=5.0.0
```

The unrelated `apps/duokai-web` lock entry is absent. Final `package-lock.json` diff size is 117 added lines and 1 removed line.

An offline `npm ci --dry-run` could not be used as final evidence because npm scanned the whole workspace and the configured mirror had no cached `eslint-config-next` response for the unrelated web workspace. It made no file changes. Lock-node integrity, installed package versions, the 83-test regression and the successful Electron build were used instead.

## Changed production paths

Expected tracked production changes are limited to:

- `electron/main.ts`
- `electron/services/proxyBridge.ts`
- `electron/services/proxyCheck.ts`
- `apps/duokai2/package.json`
- `package-lock.json`

The following non-target production paths remained unchanged:

- `electron/services/database.ts`
- `electron/services/trustedLaunch.ts`
- `electron/services/runtime.ts`
- `electron/services/fingerprint.ts`
- `electron/services/workspaceRuntime.ts`
- `electron/services/factories.ts`
- `electron/services/profileValidator.ts`
- `src/shared/types.ts`

## Remaining activation boundary

Phase 5B does not enable the Pilot for any existing profile.

The following still requires an explicit operational decision:

1. Select a disposable persisted Duokai test profile.
2. Add the `cloak-pilot-test` tag.
3. Set its exact profile ID in `DUOKAI_CLOAK_PILOT_PROFILE_IDS`.
4. Set `DUOKAI_CLOAK_PILOT_ENABLED=1`.
5. Set `DUOKAI_CLOAK_PILOT_CACHE_DIR=~/.cloakbrowser`.
6. Set `DUOKAI_CLOAK_PILOT_BINARY_SHA256=79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`.
7. Run the formal profile launch and review the resulting signed trusted record and audit log.

No existing user profile or production database was used for this phase. The real browser itself, its persistent storage behavior, installation identity, packaged secure storage and bridge lifecycle were validated with disposable data.

## Decision

**Phase 5B passed as a default-off production Pilot implementation.**

The formal launch path now has an exact test-profile gate, real fixed-version binary preflight, transactional trust publication, launch-owned bridge cleanup, OS-protected signing keys and no fallback to ordinary Chromium. The latest packaged app and the real installed Cloak Chromium both passed their dedicated runtime validations.

The implementation remains uncommitted, unmerged and disabled for all profiles by default.
