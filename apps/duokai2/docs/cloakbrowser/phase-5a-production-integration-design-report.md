# Duokai CloakBrowser Phase 5A Production Integration Design Report

**Date:** 2026-07-27
**Workspace:** `~/Documents/duokai-cloakbrowser-phase1-poc`
**Branch:** `codex/cloakbrowser-phase1-poc`
**Status:** Passed as an isolated design; not activated in production

## Scope

Phase 5A adds the design and sidecar implementation needed before a controlled production pilot:

- trusted snapshot signing and verification;
- OS-protected signing-key storage adapter;
- fixed-version browser delivery validation;
- transactional launch ordering;
- deterministic failure rollback.

It does not modify the formal profile launch path, database schema, current `TrustedLaunchSnapshot`, production snapshot persistence or real profiles.

Protected paths remained unchanged:

- `electron/main.ts`
- `services/trustedLaunch.ts`
- `services/workspaceSnapshots.ts`
- `services/database.ts`
- `services/proxyBridge.ts`
- `src/shared/types.ts`

## Audit findings

1. The repository had no dedicated Keychain or Electron `safeStorage` layer for signing trusted identity records.
2. The current launch flow does not represent the complete Cloak launch as one compensating transaction.
3. The current proxy bridge uses a global cache and exposes no launch-owned release or reference-count handle.
4. Application shutdown can close browser contexts but cannot prove that every bridge acquired by a failed Cloak launch is released.
5. The desktop build still prepares the legacy Playwright Chromium, while Cloak Chromium has no approved production installer flow.

## Added modules

### `cloakBrowserSnapshotSignature.ts`

Implements:

- canonical JSON;
- domain-separated `HMAC-SHA256` signatures;
- timing-safe verification;
- versioned signed records;
- atomic signed-record read/write;
- in-memory test provider;
- Electron `safeStorage` key provider;
- atomic mode-`0600` encrypted key envelope;
- fail-closed behavior when secure storage, the referenced key or signature validation is unavailable.

The signing provider uses a random 256-bit key. Only the `safeStorage`-encrypted form is written to disk. Linux `basic_text` storage is rejected.

### `cloakBrowserDeliveryPolicy.ts`

Defines a fixed-version delivery manifest that binds:

- wrapper version;
- full browser package and runtime versions;
- stable channel and platform;
- browser path and SHA256;
- external managed cache;
- explicit installation preflight;
- disabled launch download and auto-update;
- forbidden fallback engine.

Readiness is blocked for missing, drifted or incorrectly located binaries. The manifest cache directory must also match the wrapper-provided binary descriptor cache directory. The managed cache may not be inside the application bundle, resources directory or temporary directory.

### `cloakBrowserProductionTransaction.ts`

Defines this strict ordering:

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

No trusted state is published before every earlier gate succeeds.

On failure, mutation rollback runs in reverse order, then resources close in this order:

```text
trusted-state rollback
signed-snapshot rollback
browser close
transport close
```

The transaction preserves the original failed stage, separately reports rollback errors and treats cancellation as fail-closed. Successful session cleanup is idempotent.

## Signing model

The signed record contains the complete Phase 4 trusted identity snapshot and:

```text
algorithm=HMAC-SHA256
keyId=<derived identifier>
signedAt=<ISO timestamp>
payloadSha256=<canonical payload SHA256>
valueBase64=<signature>
```

Canonical JSON prevents object key ordering from changing the signed meaning. The HMAC authenticates the snapshot, record schema and signature metadata, including `algorithm`, `keyId`, `signedAt` and `payloadSha256`; changing any of them invalidates the record.

The HMAC protects the record while the signing key remains protected by the operating system. It is not hardware attestation and does not defend against arbitrary code execution inside the trusted Electron main process.

## Delivery decision

The Phase 5A production design is:

```text
deliveryMode=managed-cache-preinstalled
installTrigger=explicit-preflight
launchAutoDownload=false
wrapperAutoUpdate=false
browserAutoUpdate=false
fallbackEngine=forbidden
```

The production installer/updater itself is not implemented in Phase 5A.

## Targeted tests

Added `cloakBrowserProductionIntegration.test.ts` with coverage for:

- canonical serialization;
- signing and verification;
- record and signature tamper rejection;
- unavailable-key rejection;
- encrypted key creation and reload;
- unsafe storage rejection;
- atomic record persistence;
- delivery readiness and binary drift;
- unsafe cache locations;
- successful transaction ordering;
- startup failure rollback;
- trust-publication rollback;
- rollback-error preservation;
- cancellation before resource acquisition.

Result:

```text
15/15 passed
```

## Failure-injection smoke

Added `smoke:cloak-production-pilot`.

The smoke used temporary files, an injected `safeStorage`-compatible test adapter and disposable resources. It did not access the real macOS Keychain, database, production bridge or real profile.

Signing result:

```text
algorithm=HMAC-SHA256
sealedKeyCreated=true
plaintextSecretAbsent=true
signedRecordWritten=true
signedRecordReadBack=true
tamperRejected=true
leftoverTemporaryFiles=[]
```

Delivery result:

```text
ready=true
deliveryMode=managed-cache-preinstalled
installTrigger=explicit-preflight
launchAutoDownload=false
fallbackEngine=forbidden
missingBinaryBlocked=true
```

Transaction result:

```text
successPathTrusted=true
successCleanupOrder=browser,transport
startupFailureRolledBack=true
startupFailurePersistedTrust=false
startupFailureCleanupOrder=browser,transport
publicationFailureSnapshotRolledBack=true
rollbackFailureCaptured=true
```

## Final regression and packaging audit

The final disk version passed:

```text
Phase 5A targeted tests: 15/15
Combined Cloak tests:    67/67
TypeScript:              passed
Phase 1 runtime smoke:   passed
Phase 2 fingerprint:     passed
Phase 3 network:         passed
Phase 4 snapshot:        passed
Phase 5A pilot smoke:    passed
Electron macOS arm64:    build:dir passed
npm ci dry-run:          passed
git diff --check:        passed
```

Final ASAR audit:

```text
cloakWrapperEntries=74
fingerprintModuleEntries=0
networkModuleEntries=0
trustedSnapshotModuleEntries=0
snapshotSignatureModuleEntries=0
deliveryPolicyModuleEntries=0
productionTransactionModuleEntries=0
cloakBinaryEntries=0
```

This confirms that the Cloak wrapper dependency remains available, while the Phase 2–5A sidecar modules are not imported into the production bundle and the external Cloak Chromium binary is not packaged inside the application.

All protected production paths remained unchanged.

## Required work before Phase 5B

Phase 5A does not authorize launch replacement. Phase 5B must first:

1. Add a default-off pilot flag and explicit test-profile eligibility.
2. Add launch-owned release or reference counting to the production proxy bridge.
3. Wire the transaction ordering into the real launch lifecycle.
4. Select final signed-record and encrypted-key paths.
5. Define key rotation and secure-storage reset behavior.
6. Run a packaged Electron `safeStorage` test with disposable pilot data.
7. Implement fixed-version Cloak Chromium installation and integrity preflight.
8. Ensure the pilot path never falls back to legacy Playwright Chromium.
9. Define UI states for unverified, verifying, trusted, stale, invalid, rolling-back and failed.
10. Define crash recovery around snapshot persistence and trust publication.
11. Verify secrets and proxy credentials do not enter logs, exports or persisted diagnostics.
12. Preserve existing production behavior when the pilot flag is disabled.

## Decision

**Phase 5A passed as an isolated design and sidecar implementation.**

The work demonstrates a keyed trusted-record format, OS-encrypted key envelope, fixed-version browser delivery gate and compensating launch transaction. It remains disconnected from the formal launch path and is uncommitted and unmerged.
