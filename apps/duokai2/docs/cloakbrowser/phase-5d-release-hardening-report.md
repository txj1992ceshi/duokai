# Phase 5D.1 — CloakBrowser Release Hardening Report

## Status

**PASSED — isolated release-hardening scope.**

Phase 5D.1 adds fixed-version installation evidence, multi-generation signing-key lifecycle, cross-process transaction recovery, and minimal integration into the existing default-off, exact-profile Pilot path.

This result does **not** activate CloakBrowser globally, merge the worktree, publish a release, add Developer ID signing/notarization, or authorize real production profiles.

## Execution boundary

- Worktree: `~/Documents/duokai-cloakbrowser-phase1-poc`
- Branch: `codex/cloakbrowser-phase1-poc`
- Primary implementation Task Graph: `task_e1840082-e618-48dd-97bf-9972d9c8fcb3`
- Host GUI verification Task Graph: `task_71b881e8-6589-47b4-8273-e68d38d5577a`
- No commit, merge, push, remote addition, or global Git configuration change
- No formal production database, real profile, real proxy, or unrelated workspace was modified
- Pilot remains disabled by default and requires an exact local Profile-ID allowlist

## Scope delivered

### 1. Fixed-version installation manager

Added:

- `electron/services/cloakBrowserInstallationManager.ts`
- `electron/services/cloakBrowserInstallationManager.test.ts`
- `scripts/run-cloak-installation-smoke.ts`

Properties:

- installation requires explicit release-engineering consent;
- application launch never silently downloads a browser;
- wrapper, package version, executable Chromium version, release channel, cache root, binary path and binary SHA256 are bound into an installation receipt;
- the receipt is canonicalized, self-hashed and written atomically with private file permissions;
- launch verification reads the receipt and current binary state without invoking the installer;
- receipt tampering, cache-path escape, missing binary and current-binary drift fail closed;
- fallback remains forbidden.

Real installation receipt:

- Path: `~/.cloakbrowser/duokai-cloak-install-receipt.json`
- Mode: `0600`
- Wrapper: `0.5.2`
- Package: `145.0.7632.109.2`
- Executable Chromium: `145.0.7632.109`
- Binary SHA256: `79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`
- Launch-time automatic download: `false`
- Fallback engine: `forbidden`

The existing fixed binary was reused; it was not replaced during receipt preparation.

### 2. Snapshot signing-key lifecycle

Added:

- `electron/services/cloakBrowserSnapshotKeyLifecycle.ts`
- `electron/services/cloakBrowserSnapshotKeyLifecycle.test.ts`

Properties:

- schema-2 multi-generation keyring protected by Electron `safeStorage`;
- one active key and retained retired keys;
- rotation switches future signing to a new key while old snapshots remain verifiable;
- reset intentionally invalidates all previous key IDs;
- legacy schema-1 single-key files migrate atomically without changing the original key identity;
- malformed keyrings, unknown key IDs, unavailable secure storage and Linux `basic_text` fail closed;
- plaintext secret material is never written to disk.

Packaged macOS verification used the real Keychain-backed Electron `safeStorage` implementation and proved:

- encryption available;
- selected backend `keychain`;
- legacy migration succeeded;
- rotation succeeded;
- retired key remained readable;
- active key remained stable after provider reload;
- keyring schema version was `2`;
- keyring mode was `0600`;
- plaintext key material was absent.

### 3. Cross-process transaction recovery

Added:

- `electron/services/cloakBrowserTransactionRecovery.ts`
- `electron/services/cloakBrowserTransactionRecovery.test.ts`

The private, self-hashed journal records:

- transaction and Profile identities;
- current transaction stage;
- previous signed record;
- whether a new snapshot was persisted;
- whether trusted state was published;
- timestamps and journal integrity hash.

Recovery properties:

- no journal is an idempotent no-op;
- a new uncommitted signed record is removed after interruption;
- an earlier signed record is restored when interruption occurs after trust publication;
- trusted Profile state is rolled back through an explicit callback;
- successful commit removes the journal while preserving the new trusted record;
- a tampered journal fails closed without modifying the signed record;
- recovery itself is idempotent.

Packaged recovery verification simulated interruption after snapshot persistence and proved:

- interruption detected;
- uncommitted record removed;
- recovery journal cleared after successful recovery.

### 4. Minimal Pilot integration

Modified the existing Pilot orchestration without changing eligibility semantics:

- production Pilot launch verifies the fixed-version installation receipt;
- the default signing provider is now the schema-2 keyring;
- a Profile-specific transaction journal is recovered before existing snapshot verification;
- transaction stages, snapshot persistence and trust publication are journaled;
- the journal is committed only after the transaction reaches `trusted`;
- an ordinary transaction failure with complete in-process rollback clears the journal;
- incomplete rollback or process interruption leaves evidence for next-start recovery;
- interrupted published trust is downgraded to `stale`, the trusted snapshot is cleared, and a full verification is required;
- the legacy browser path remains unchanged when Pilot is disabled;
- exact local Profile-ID allowlisting remains mandatory;
- no silent fallback to ordinary Chromium is permitted.

## Automated verification

### Focused tests

- Installation manager + key lifecycle: **10/10 passed**
- Transaction recovery: **5/5 passed**
- Installation, key lifecycle, recovery and Pilot integration: **18/18 passed**

### Combined Cloak suite

Command:

```text
npm run test:cloak-runtime
```

Result: **106/106 passed**.

The standard Cloak regression entry now includes the Phase 5D installation-manager, key-lifecycle and recovery tests.

### TypeScript and static checks

- TypeScript project build: passed
- `git diff --check`: passed
- No unresolved transaction command session remained

## Real Cloak runtime verification

The workspace sandbox could locate and start the fixed Cloak binary but could not manage its GUI child-process lifecycle (`kill EPERM`). Real browser and packaged application lifecycle validation was therefore executed through the same junhuo local-agent host channel. No old executor or OpenClaw was used.

Real Runtime smoke passed with two consecutive launches and proved:

- fixed Cloak Chromium binary identity;
- popup operation;
- download operation;
- Cookie persistence;
- LocalStorage persistence;
- storage-state persistence;
- stable runtime identity;
- no ordinary Chromium fallback.

Additional real smokes passed for:

- fingerprint mapping;
- proxy/network mapping;
- trusted identity snapshots;
- production transaction success and rollback behavior.

Network evidence included:

- loopback HTTP bridge transport;
- upstream credentials absent from Cloak launch configuration;
- locale, timezone and geolocation alignment;
- no observed private/local WebRTC host candidate;
- no external STUN/TURN configuration.

## Build and packaged verification

Latest directory build:

- Platform: macOS arm64
- Output: `apps/duokai2/release/mac-arm64/Duokai.app`
- Build result: passed
- Signing: ad-hoc
- Notarization: not performed

Packaged diagnostic schema version: `2`.

It ran with a dedicated temporary `userData` directory and verified:

- real Electron `safeStorage` / Keychain;
- schema-1 to schema-2 migration;
- key rotation and retired-key access;
- cross-process journal recovery;
- proxy bridge reference lifecycle `2 → 1 → 0`;
- final loopback port closure;
- no temporary bridge leftovers.

The diagnostic did not initialize or modify the formal Duokai database or a real Profile.

## ASAR audit

Latest `app.asar` evidence:

- Total entries: `6745`
- Cloak wrapper entries: `74`
- `playwright-core` entries: `398`
- Embedded Cloak binary entries: `0`

Required Phase 5D markers were present in the packaged main process:

- `duokai-cloak-install-receipt.json`
- `explicit-fixed-version`
- `production-transaction.json`
- `Cloak signing-key keyring`
- interrupted-transaction recovery state handling

Interpretation:

- wrapper and integration code are packaged;
- the fixed Cloak binary remains an externally managed installation;
- the application does not silently bundle or replace that binary;
- release readiness still depends on explicit installation management and receipt verification.

## Change-scope audit

Phase 5D added or modified only the release-hardening, Pilot integration, test, diagnostic, package-script and report surfaces required by this scope.

The worktree also contains the accumulated Phase 1–5C changes and an untracked disposable evidence directory under `.pilot-runtime/phase5c-*`. That evidence directory was intentionally retained because recursive cleanup was not authorized. It is not part of the packaged application.

## Known limits and remaining release gates

Phase 5D.1 does not provide:

- production-wide Cloak activation;
- an end-user installer/updater UI;
- automatic background browser updates;
- Developer ID signing or Apple notarization;
- hardware-backed attestation;
- protection against arbitrary code execution inside the trusted Electron main process;
- a broad production-profile rollout.

Before general release, the project still needs:

1. a supported user-facing installer/update and rollback workflow around the fixed-version receipt;
2. Developer ID signing, notarization and release-channel verification;
3. staged gray rollout with disposable and then limited real Profiles;
4. operational telemetry and support procedures for receipt drift, key reset and interrupted-transaction recovery;
5. explicit approval for cleanup of retained local runtime evidence;
6. commit/review/merge and release approval through the normal repository process.

## Final conclusion

Phase 5D.1 is **passed as isolated release hardening**. The default-off exact-profile Pilot now has auditable fixed-version installation evidence, a secure multi-generation signing-key lifecycle, and fail-closed cross-process transaction recovery. All focused and combined tests, TypeScript checks, real Cloak smokes, macOS arm64 packaging, packaged Keychain diagnostics and ASAR audits passed.

No commit, merge, push or production-wide activation was performed.
