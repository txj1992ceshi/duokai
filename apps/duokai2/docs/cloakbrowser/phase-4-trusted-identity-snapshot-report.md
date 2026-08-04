# Duokai CloakBrowser Phase 4 Trusted Identity Snapshot Report

**Date:** 2026-07-27
**Workspace:** `~/Documents/duokai-cloakbrowser-phase1-poc`
**Branch:** `codex/cloakbrowser-phase1-poc`
**Status:** Passed
**Target runtime:** CloakBrowser wrapper `0.5.2`, Chromium package `145.0.7632.109.2`, runtime `145.0.7632.109`

## 1. Scope protection

Phase 4 was implemented and verified only in the isolated sibling worktree. The original `~/Documents/duokai` worktree and its existing changes were not modified.

This phase did not modify or activate the existing production trusted-launch write path. In particular, it did not modify:

- `apps/duokai2/electron/main.ts`
- `apps/duokai2/electron/services/trustedLaunch.ts`
- `apps/duokai2/electron/services/workspaceSnapshots.ts`
- `apps/duokai2/electron/services/database.ts`
- `apps/duokai2/src/shared/types.ts`
- the formal profile launch path
- real profile metadata or workspace snapshots

No real profile, real proxy account, proxy credential, database row or existing trusted snapshot was read or changed by the Phase 4 smoke.

## 2. Existing trusted-snapshot gap

The production `TrustedLaunchSnapshot` currently records:

- configuration and proxy fingerprint hashes;
- verified egress location data;
- effective proxy transport;
- desktop application version;
- Chromium major;
- coarse HTTPS, leak and startup-navigation results.

It does not bind all of the runtime material required by the single-engine CloakBrowser design. Specifically, it does not record:

- CloakBrowser wrapper version;
- requested and installed full Chromium package versions;
- executable and running Chromium versions;
- browser binary path and SHA256;
- Cloak release channel, tier and platform;
- stable fingerprint mapping schema and mapping hash;
- network identity mapping schema and mapping hash;
- the fail-closed engine/update/GeoIP/legacy-injection policy;
- structured verification evidence and its WebRTC observation limit.

The existing snapshot builder and production persistence flow are concentrated in `electron/main.ts`. Phase 4 deliberately left that code unchanged and introduced an isolated sidecar model instead.

## 3. Implemented files

### Added

- `electron/services/cloakBrowserTrustedSnapshot.ts`
- `electron/services/cloakBrowserTrustedSnapshot.test.ts`
- `scripts/run-cloak-trusted-snapshot-smoke.ts`
- `docs/cloakbrowser/phase-4-trusted-identity-snapshot-report.md`

### Modified

- `package.json`

The new npm command is:

```text
smoke:cloak-trusted-snapshot
```

The combined Cloak test command now includes the Phase 4 snapshot tests.

## 4. Snapshot schema

The isolated `CloakTrustedIdentitySnapshot` schema version is `1`.

A trusted record binds the following data into one aggregate SHA256 payload:

### Runtime identity

- engine: `cloakbrowser`;
- wrapper version;
- requested and installed Chromium package versions;
- executable and live runtime Chromium versions;
- Chromium major;
- binary path and binary SHA256;
- tier, release channel and platform;
- runtime verification timestamp.

### Stable fingerprint identity

- full Phase 2 fingerprint mapping;
- mapping schema version and mapping hash;
- stable seed and seed source;
- platform, locale and timezone;
- mapped native arguments;
- geolocation and permissions;
- native-owned signal list;
- `legacyInitScriptPolicy=forbidden`;
- compatibility warnings.

### Network identity

- full credential-free Phase 3 network mapping;
- mapping schema version and mapping hash;
- proxy mode, proxy identity fingerprint and upstream endpoint identity;
- verified egress identity;
- WebRTC mode, verified IP and mapped arguments;
- IP-family policy and geolocation;
- stable transport class.

The volatile loopback bridge address is deliberately removed from the stored record. It is represented only as:

```text
transportClass=direct
```

or:

```text
transportClass=loopback-http-bridge
```

This prevents an ephemeral port from invalidating an otherwise stable identity and prevents the snapshot from becoming a reusable browser proxy configuration.

### Fail-closed policy

Every accepted snapshot must declare:

```text
engineFallback=forbidden
wrapperAutoUpdate=disabled
browserAutoUpdate=disabled
wrapperGeoIpResolution=disabled
legacyInitScript=forbidden
upstreamCredentialExposure=forbidden
```

### Verification evidence

A trusted record requires successful evidence for:

- runtime identity;
- persistent-context launch;
- startup navigation;
- network route;
- credential redaction;
- locale and timezone;
- geolocation;
- absence of local WebRTC host leakage;
- absence of legacy JavaScript fingerprint injection.

WebRTC candidate observation is recorded separately as one of:

- `verified-ip-observed`;
- `no-candidates`;
- `disabled`;
- `not-required`.

A proxy-bound identity cannot silently represent unobserved candidate substitution as verified.

## 5. Cross-layer validation

Snapshot creation and reuse fail closed when any of these identities disagree:

- snapshot profile ID, fingerprint profile ID and network profile ID;
- runtime Chromium major and fingerprint Chromium major;
- live runtime Chromium base version and mapped fingerprint Chromium version;
- fingerprint locale and verified network language;
- fingerprint timezone and verified network timezone;
- fingerprint and network geolocation;
- fingerprint and network WebRTC arguments;
- component mapping payloads and their mapping hashes;
- aggregate snapshot payload and its snapshot hash.

Reuse also rejects or marks stale:

- binary SHA or runtime identity drift;
- wrapper, package, runtime, platform, tier or channel drift;
- fingerprint mapping drift;
- network mapping drift;
- desktop application version drift;
- host-environment drift;
- snapshot age outside the configured freshness window.

## 6. Credential and transport isolation

The stored network mapping excludes `launchProxy`, including its loopback address and ephemeral port.

Unit tests verified that serialized snapshots do not contain the sentinel upstream username or password. The real direct-path smoke also confirmed that the generated snapshot contains no `username`, `password` or `launchProxy` keys.

The snapshot retains only the stable upstream endpoint identity and a credential-free proxy fingerprint. It is evidence, not a launch transport configuration.

## 7. Atomic persistence

`writeCloakTrustedIdentitySnapshotAtomic()` performs:

1. validation before writing;
2. creation of a mode `0600` temporary file in the destination directory;
3. complete JSON serialization with a trailing newline;
4. same-directory atomic `rename` to the final path;
5. best-effort temporary-file cleanup on failure.

The unit test and real smoke both verified successful read-back and no leftover `.tmp` files.

## 8. Unit tests

Phase 4 added ten focused tests covering:

- deterministic aggregate binding;
- upstream credential and temporary bridge exclusion;
- aggregate payload tamper detection;
- fingerprint and network component-hash tamper detection;
- runtime binary/version mismatch rejection;
- cross-layer locale and WebRTC drift rejection;
- incomplete evidence rejection;
- exact reuse plus runtime, mapping and age drift decisions;
- atomic write/read behavior;
- tampered on-disk snapshot rejection.

Result:

```text
10/10 passed
```

The final combined Cloak suite passed:

```text
52/52 passed
```

TypeScript validation passed with `tsconfig.node.json --noEmit`.

## 9. Real Cloak trusted-snapshot smoke

The real smoke used only:

- a temporary browser profile;
- a temporary downloads directory;
- a temporary snapshot directory;
- the already installed Cloak Chromium package;
- an ephemeral loopback HTTP fixture;
- documentation-only identity IP `203.0.113.25`;
- no real profile, database or proxy account.

The browser loaded:

```text
PHASE4_TRUSTED_SNAPSHOT_OK
```

Observed runtime identity:

```text
engine=cloakbrowser
wrapper=0.5.2
requestedPackage=145.0.7632.109.2
installedPackage=145.0.7632.109.2
executableChromium=145.0.7632.109
runtimeChromium=145.0.7632.109
binarySha256=79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79
platform=darwin-arm64
```

Observed mapping hashes:

```text
fingerprintMappingHash=136018f9c60ea453918a39d3cbdf0182d9bc1127a1bc4a15ec471702645e6253
networkMappingHash=0d6204461fb083ea422e10be1185af9f0c81f47297c995f28f2fea562edcda5f
proxyFingerprintHash=1e575380373df4597b2f9affeb98a409029ee5a40b37c219a8e4426a76c3035e
```

Observed snapshot result:

```text
snapshotHash=f8177865c3ef7d9fb52e2e08322abb7d23180de4daf4b575f3722a6d6a8b2b91
transportClass=direct
atomicWritePassed=true
readBackPassed=true
reusePassed=true
tamperDetectionPassed=true
credentialRedactionPassed=true
leftoverTemporaryFiles=[]
```

Observed browser identity:

```text
language=en-US
languages=en-US,en
timezone=America/Los_Angeles
geolocation=34.0522,-118.2437
navigator.webdriver=false
legacyInjectionPresent=false
```

Final evidence:

```text
runtimeIdentityPassed=true
persistentContextPassed=true
startupNavigationPassed=true
networkRoutePassed=true
credentialRedactionPassed=true
localeTimezonePassed=true
geolocationPassed=true
webRtcHostLeakAbsent=true
verifiedWebRtcIpObserved=false
webRtcCandidateObservation=no-candidates
legacyInjectionAbsent=true
```

## 10. Evidence and security limits

### WebRTC

The smoke intentionally used no external STUN or TURN service. Cloak Chromium produced no ICE candidates. The record therefore proves that no local-interface candidate was exposed, but it does not claim page-level observation of `203.0.113.25` as an ICE candidate.

### Snapshot hash

The aggregate SHA256 provides deterministic integrity and accidental/out-of-band tamper detection. It is not a digital signature, MAC or operating-system-backed attestation. A malicious local process that can rewrite the file and recompute every hash is outside the protection provided by this phase.

A production integration should consider signing or keying the record with an application-controlled secret or platform keystore after the storage and threat model is approved.

### Network identity fixture

`203.0.113.25` is documentation-only test material. Phase 4 validates identity binding and persistence; it does not claim that this address was the machine's actual public egress IP. The real proxy route was independently proven in Phase 3.

## 11. Production integration gate

Phase 4 does not authorize replacing the current production snapshot or launch flow.

Before integration, Duokai must define:

- the final storage location and retention policy;
- whether the snapshot is stored in workspace metadata, a dedicated sidecar or database state;
- signing/key-management requirements;
- atomic ordering between network verification, Cloak launch, startup navigation, snapshot persistence and launch approval;
- stale/invalid status propagation to the UI and control plane;
- rollback behavior when snapshot persistence fails;
- a controlled STUN/TURN candidate-replacement test if direct WebRTC substitution evidence is required.

## 12. Final build and packaging audit

Final verification passed for:

- the combined `52/52` Cloak unit-test suite;
- TypeScript `tsconfig.node.json --noEmit`;
- Phase 1 runtime persistence smoke;
- Phase 2 stable fingerprint smoke;
- Phase 3 proxy/network identity smoke;
- Phase 4 trusted-snapshot smoke;
- Electron macOS arm64 `build:dir`;
- `npm ci --ignore-scripts --dry-run`;
- `git diff --check`.

The final ASAR audit returned:

```text
cloakWrapperEntries=74
trustedSnapshotModuleEntries=0
networkModuleEntries=0
fingerprintModuleEntries=0
cloakBinaryEntries=0
```

The wrapper dependency is available, but the Phase 2–4 sidecar modules are not imported by the production bundle and the Cloak Chromium binary is not packaged inside the application.

The protected production paths remained unchanged.

## 13. Phase decision

**Decision: Phase 4 passed.**

The isolated implementation demonstrates that Duokai can create, persist, read and reuse a single credential-free trusted identity record that atomically binds the actual Cloak runtime binary, stable fingerprint mapping, verified network mapping, fail-closed policy and structured launch evidence.

The production launch path, current `TrustedLaunchSnapshot` type and production snapshot persistence remain unchanged. The work is uncommitted and unmerged.
