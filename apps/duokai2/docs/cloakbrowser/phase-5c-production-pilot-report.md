# CloakBrowser Phase 5C Production Pilot Hardening and Packaged E2E Report

Date: 2026-07-27

Status: **PASSED for the isolated, exact-profile production Pilot.** This phase does not authorize a general production rollout, automatic migration of other Profiles, or replacement of the default browser path.

## 1. Scope and safety boundary

Phase 5C hardened the default-off Cloak production Pilot and completed a packaged Electron end-to-end test using a disposable copy of Profile `<pilot-profile-id>` (`试点 Profile`).

The work remained on branch `codex/cloakbrowser-phase1-poc` in worktree `~/Documents/duokai-cloakbrowser-phase1-poc`.

Safety constraints preserved throughout the phase:

- no commit, merge, push, remote creation, or global Git configuration change;
- no Pilot write to the formal Profile database or formal workspace;
- no launch of `非目标 Profile`;
- no wildcard Pilot eligibility;
- no launch-time Cloak download or fallback to the legacy browser on the Pilot path;
- no proxy credentials in trusted snapshots, compatibility receipts, UI state, or reports;
- all destructive signature tests were limited to the disposable workspace and were restored afterward.

## 2. Formal database recovery and health

The formal database at:

`~/Library/Application Support/duokai2-desktop/bitbrowser-clone.sqlite`

had a malformed B-tree in the legacy `logs` table. The recovery procedure used an original three-file DB/WAL/SHM backup, SQLite recovery into a new candidate, candidate validation, and guarded atomic replacement. It did not delete the damaged table in place.

Recovery evidence:

- all non-damaged business tables remained readable;
- eight healthy business tables matched the original row counts and content SHA256 values;
- `profiles=2` and `proxies=2` were preserved;
- `122,235` legacy log rows were recovered;
- no `lost_and_found` fragments were produced;
- the candidate passed insert/read/delete/checkpoint write testing before replacement;
- the formal packaged application subsequently opened and wrote the recovered database successfully.

Final Phase 5C read-only recheck:

- source DB SHA256: `8773c36a54153cc5bc315aae884724167db0c74c94bc83f4ba0e4b49b5641998`;
- SHA256 exactly matched the value captured when the isolated E2E copy was created;
- `PRAGMA quick_check`: `ok`;
- `PRAGMA integrity_check`: `ok`;
- `profiles=2`, `proxies=2`, `runtime_logs=1407`, `logs=122235`;
- both Profiles were `stopped` with empty tags.

`非目标 Profile` remained unchanged and was never launched. Its stored browser major remained `149`, and its formal workspace path remained under the formal application-support directory.

## 3. Local-only Pilot eligibility

The Pilot no longer depends on a cloud-synchronized Profile tag for normal product operation. A local configuration file controls exact Profile eligibility:

- schema versioned;
- default-off when missing;
- exact Profile IDs only;
- wildcard entries rejected;
- atomic writes;
- file mode `0600`;
- parent directory mode `0700`.

The packaged E2E enabled only `试点 Profile`. The formal and isolated Profile rows retained empty tags. Enabling the Pilot did not rewrite browser-version or fingerprint fields in the database.

The renderer UI and preload IPC expose:

- enable/disable action for a stopped Profile;
- target and stored browser versions;
- `disabled`, `unverified`, `verifying`, `trusted`, `stale`, `invalid`, `rolling-back`, and `failed` state mapping;
- switching blocked while the Profile is running or starting.

## 4. Runtime compatibility overlay

The Pilot builds an in-memory compatibility view instead of mutating the stored Profile.

The compatibility receipt binds:

- local Pilot configuration hash and timestamp;
- stored and effective Chromium versions and majors;
- original and effective User-Agent values;
- original and effective browser-kernel values;
- original and effective Canvas, WebGL image, AudioContext, and ClientRects modes;
- the exact fields changed in memory;
- compatibility warnings;
- a deterministic receipt SHA256.

Two compatibility cases are covered:

1. A stored Chrome 147 identity may be aligned to the fixed Cloak 145 identity in memory without changing the stored Profile.
2. A legacy partial native-noise policy is normalized in memory to one coherent seed-derived native policy.

The real `试点 Profile` fixture stored:

- Canvas: `custom`;
- WebGL image: `custom`;
- AudioContext: `custom`;
- ClientRects: `off`.

For the Pilot launch, only ClientRects was changed to `custom` in memory. The signed receipt recorded `clientRects: off -> custom`; the database retained the original `off` value.

The strict fingerprint mapper itself was not relaxed. Direct mapping of an unnormalized partial policy still fails closed.

## 5. Trusted evidence and key handling

The trusted record is a domain-separated HMAC-SHA256 signed record. It atomically binds:

- runtime and binary identity;
- fingerprint mapping;
- network identity;
- startup evidence;
- policy metadata;
- the Pilot compatibility receipt.

The packaged Electron E2E used the real `safeStorage`-backed sealed key provider. The key survived application restart and successfully verified the existing record. Plaintext key material was not written.

The signed record used mode `0600` and was stored inside the disposable Profile workspace.

## 6. Launch-state hardening

### 6.1 Stale trusted-state repair

A real retry exposed a status bug: an outer proxy preflight failure could leave the previous `trusted` badge visible even though the current launch failed.

The launch state machine now:

- enters `verifying / launch_requested` for every new eligible launch;
- clears the previous snapshot ID and error at launch start;
- maps all outer launch failures to `failed` or `invalid`;
- maps signature and trusted-record failures to `invalid / signed_evidence_invalid`;
- prevents a prior trusted state from being reused as current launch status.

A transient proxy tunnel failure was observed during E2E and correctly used to verify this behavior after the repair.

### 6.2 Startup-verification timeout

The production transaction now applies a fail-closed total timeout to the startup-verification stage:

- default timeout: `60,000 ms`;
- invalid timeout configuration is rejected;
- timeout preserves `startup-verification` as the failed stage;
- no signed record or trusted state is persisted;
- rollback closes the browser first and transport second.

A focused injected-hang test confirms timeout and cleanup behavior. The final packaged second launch completed successfully before the timeout.

## 7. Packaged macOS E2E

Application:

`apps/duokai2/release/mac-arm64/Duokai.app`

Packaging evidence:

- macOS arm64 Electron `41.0.2`;
- ad-hoc code signature verified with `codesign --verify --deep --strict`;
- bundle identifier `com.jj.duokai2`;
- notarization intentionally disabled for this directory-build Pilot;
- `app.asar` SHA256: `f98fb8e54fa0aead32ebea8b11c1b8345de83257936b212d5055d990e7f02a23`;
- `dist-electron/main.js` SHA256: `68f1d503e369c980cd663de0f683e236f940c5a816c9857372b38394b7e1f43e`;
- `dist-electron/preload.mjs` SHA256: `cb21aa7090e3f46e739916619ee265eccb4b8ef65e749db512f1039c4d7c620e`.

Disposable E2E root:

`.pilot-runtime/phase5c-20260727T130206Z`

The isolated DB passed `quick_check=ok`, and only the authorized Profile workspace was copied.

### First trusted launch

- local exact-ID Pilot enablement passed;
- startup navigation and runtime verification passed;
- effective runtime version: `145.0.7632.109.2`;
- trusted snapshot: `b05343ed-9765-493c-85cb-0d088e88ec4b`;
- normal product stop returned the Profile to `stopped`;
- Cloak Chromium exited.

### Second trusted launch after stop/restart

- the sealed signing key and existing record were read successfully;
- the current launch entered `verifying` rather than reusing a stale state;
- the launch completed with `running=true`, `starting=false`, zero retries, and no error;
- trusted snapshot: `2a5466b1-4e47-4ded-a548-a2b2690c8b82`;
- normal product stop returned the Profile to `stopped`;
- Cloak Chromium exited.

### Signed-record tamper rejection

The disposable signed record was backed up, changed by appending `-tampered` to the snapshot ID, and atomically replaced with mode `0600`.

- original SHA256: `f3c11933ba1e5275236db13ec0e9c65d134a4faac2f5144a3f7190ca3d0d8311`;
- tampered SHA256: `833e14e7673fe0355bf4fb3594aaa4d861f97f05647628e4a6a49493eebecc18`;
- final state: `invalid / signed_evidence_invalid`;
- error: trusted snapshot hash did not match its payload;
- three scheduler attempts were rejected before the transaction delivery or browser-launch stages;
- audit `forbiddenStageCount=0` for `delivery-preflight` and `browser-launch` after tampering;
- Cloak Chromium remained stopped.

The original record was then restored atomically:

- restored SHA256 exactly matched the original;
- mode remained `0600`;
- temporary files: none;
- backup file removed.

## 8. Runtime pin verification

The authorized cache contained one Cloak binary only:

- path: `~/.cloakbrowser/chromium-145.0.7632.109.2/Chromium.app/Contents/MacOS/Chromium`;
- version output: `Chromium 145.0.7632.109`;
- SHA256: `79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79`.

The wrapper welcome banner displayed major 146 during a forced shutdown. Source inspection confirmed that this banner uses the package's cross-platform display constant. The same package configuration maps `darwin-arm64` and `darwin-x64` to `145.0.7632.109.2`. The cache inventory, direct version output, launch preflight, and signed runtime identity all agreed on the macOS 145 binary. No alternative cache binary or fallback launch was observed.

## 9. Verification summary

- focused and combined Cloak tests: **91/91 passed**;
- TypeScript project build: passed;
- Vite renderer/main/preload builds: passed;
- macOS arm64 directory packaging: passed;
- ad-hoc signature verification: passed;
- `git diff --check`: passed;
- formal DB SHA unchanged during isolated E2E: passed;
- formal DB quick/integrity checks: passed;
- first trusted packaged launch: passed;
- normal close and resource release: passed;
- second trusted packaged launch: passed;
- signature tamper rejection before browser launch: passed;
- signed-record restoration: passed;
- no commit, merge, or push: confirmed.

## 10. Remaining release boundaries

Phase 5C proves an exact-profile, local-only production Pilot. The following remain outside this phase:

- broadening eligibility beyond explicitly selected local Profile IDs;
- automatic migration of existing Profiles;
- notarized release packaging and distribution;
- a formal Cloak binary installer/updater workflow;
- fleet-level key rotation and recovery UI;
- enabling the Pilot by default;
- removing the legacy browser path for non-Pilot Profiles.

A production rollout decision should be a separate reviewed phase after code review, release signing/notarization, installer policy, and a deliberate eligibility expansion plan.
