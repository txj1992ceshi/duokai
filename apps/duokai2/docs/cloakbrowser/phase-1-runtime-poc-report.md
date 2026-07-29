# Duokai CloakBrowser Phase 1 Runtime PoC Report

**Date:** 2026-07-26
**Workspace:** `~/Documents/duokai-cloakbrowser-phase1-poc`
**Branch:** `codex/cloakbrowser-phase1-poc`
**Status:** Passed

## 1. Scope protection

The PoC was implemented in a sibling Git worktree. The original `~/Documents/duokai` worktree and its existing uncommitted changes were not modified.

The following formal runtime paths remain unchanged:

- `apps/duokai2/electron/main.ts`
- `apps/duokai2/electron/services/runtime.ts`
- `apps/duokai2/electron/services/proxyCheck.ts`
- `apps/duokai2/electron/services/fingerprint.ts`
- `apps/duokai2/electron/services/workspaceRuntime.ts`
- `apps/duokai2/electron/services/trustedLaunch.ts`
- `apps/duokai2/electron/services/factories.ts`
- `apps/duokai2/electron/services/profileValidator.ts`
- `apps/duokai2/src/shared/types.ts`

No real profile, workspace metadata, trusted snapshot or proxy credential was used or modified.

## 2. Verified compatibility baseline

- CloakBrowser wrapper: `0.5.2`
- Wrapper peer requirement: `playwright-core >=1.53.0`
- Verified Playwright Core: `1.58.2`
- Existing Duokai Playwright: `^1.58.2`
- Cloak Chromium package version: `145.0.7632.109.2`
- Runtime Chromium version: `145.0.7632.109`
- Platform: `darwin-arm64`
- Tier: `free`
- Release channel: `stable`
- Auto-update: disabled
- GeoIP auto-resolution: disabled

`playwright-core 1.58.2` was selected deliberately to match the existing Duokai Playwright runtime while satisfying CloakBrowser's peer requirement. The real persistent-context smoke and Electron directory build both passed with this combination.

## 3. Implemented files

- `electron/services/cloakBrowserIdentity.ts`
  - executable `--version` probe
  - CDP `Browser.getVersion` probe
  - streaming binary SHA256
  - binary readiness and version validation

- `electron/services/cloakBrowserRuntime.ts`
  - isolated persistent-context adapter
  - pinned version and stable channel
  - wrapper-process and Chromium-process cache/update environment configuration
  - `geoip=false`
  - protected launch-argument filtering
  - explicit fingerprint seed
  - desktop-only PoC restriction
  - fail-closed behavior without ordinary Chromium fallback

- `electron/services/cloakBrowserIdentity.test.ts`
- `electron/services/cloakBrowserRuntime.test.ts`
- `scripts/run-cloak-runtime-smoke.ts`
- `docs/cloakbrowser/phase-1-runtime-poc-report.md`

`package.json` now contains exact dependencies and PoC commands:

- `cloakbrowser: 0.5.2`
- `playwright-core: 1.58.2`
- `test:cloak-runtime`
- `smoke:cloak-runtime`

## 4. Real browser verification

The Cloak Chromium archive was downloaded through the local trusted terminal and verified by the wrapper:

- Ed25519 signature: passed
- SHA-256 archive checksum: passed
- Binary path: `~/.cloakbrowser/chromium-145.0.7632.109.2/Chromium.app/Contents/MacOS/Chromium`
- Executable SHA256: `79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`

The final smoke run passed all checks:

- first persistent-context launch
- Popup
- download and downloaded content
- storageState output
- second launch using the same `userDataDir`
- persistent Cookie
- persistent LocalStorage
- stable runtime version
- stable binary SHA256
- no ordinary Chromium fallback

The initial Cookie check used a session Cookie, which correctly disappeared after browser shutdown. The fixture was corrected to use `Max-Age=3600`; the subsequent real smoke passed. This was a smoke-fixture defect, not a CloakBrowser persistence defect.

## 5. Automated verification

- `npm ci --ignore-scripts --dry-run`: passed
- `npm ls cloakbrowser playwright-core --workspace=apps/duokai2 --depth=0`: passed
- Runtime and identity unit tests: `16/16` passed
- TypeScript checks: passed
- `npm run build:dir --workspace=apps/duokai2`: passed
- `git diff --check`: passed

## 6. Electron package audit

The macOS arm64 directory package was generated successfully at:

`apps/duokai2/release/mac-arm64/Duokai.app`

ASAR inspection found:

- CloakBrowser wrapper entries: `74`
- Cloak Chromium binary entries: `0`

The JavaScript wrapper is packaged, while the downloaded Cloak Chromium remains outside the application package in the user cache.

## 7. Lock-file note

The root `package-lock.json` was already out of sync with the declared root workspaces and did not contain `apps/duokai-web`. Running npm for the Duokai2 workspace necessarily added the missing `duokai-web` lock nodes.

The added Web nodes use the versions already fixed by `apps/duokai-web/package.json`; no unrelated Web dependency version was upgraded. CloakBrowser and its production `tar` dependencies were also added, and `playwright-core` was hoisted at the verified version `1.58.2`.

No `npm audit fix` or broad dependency update was run. npm reported 22 existing/resolved-tree vulnerabilities; remediation is outside Phase 1 scope.

## 8. Phase decision

**Decision: Phase 1 passed.**

CloakBrowser has been proven to work as an isolated, repeatable persistent browser runtime on the target macOS arm64 machine. The adapter fails closed, the real browser identity is measurable, persistence and browser primitives pass, Electron packaging succeeds, and the Cloak Chromium binary is not bundled.

Formal Duokai profile integration may now proceed to Phase 2: stable fingerprint and Cloak parameter mapping. The existing production launch path must remain unchanged until the Phase 2 mapping and duplicate-fingerprint controls are implemented and reviewed.
