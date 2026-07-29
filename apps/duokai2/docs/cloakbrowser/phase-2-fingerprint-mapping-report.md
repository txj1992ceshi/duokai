# Duokai CloakBrowser Phase 2 Stable Fingerprint Mapping Report

**Date:** 2026-07-26
**Workspace:** `~/Documents/duokai-cloakbrowser-phase1-poc`
**Branch:** `codex/cloakbrowser-phase1-poc`
**Status:** Passed
**Target runtime:** CloakBrowser wrapper `0.5.2`, Chromium package `145.0.7632.109.2`, runtime `145.0.7632.109`

## 1. Scope protection

Phase 2 was implemented and verified only in the isolated sibling worktree. The original `~/Documents/duokai` worktree and its existing changes were not modified.

The formal Duokai launch path remains unchanged. In particular, Phase 2 did not modify:

- `apps/duokai2/electron/main.ts`
- `apps/duokai2/electron/services/fingerprint.ts`
- `apps/duokai2/electron/services/runtime.ts`
- `apps/duokai2/electron/services/proxyCheck.ts`
- `apps/duokai2/electron/services/workspaceRuntime.ts`
- `apps/duokai2/electron/services/trustedLaunch.ts`
- `apps/duokai2/electron/services/factories.ts`
- `apps/duokai2/electron/services/profileValidator.ts`
- `apps/duokai2/src/shared/types.ts`

No real profile, database record, workspace metadata, proxy credential or trusted snapshot was migrated or modified.

## 2. Ownership decision

The audit confirmed that the existing `buildFingerprintInitScript()` rewrites many of the same surfaces already patched natively by Cloak Chromium. Applying both layers would create duplicate or contradictory identity changes.

The Phase 2 ownership rule is therefore:

### Cloak Chromium owns

- User-Agent and User-Agent Client Hints
- `navigator.platform`
- hardware concurrency and device memory
- screen and available-screen geometry
- GPU and WebGL identity
- Canvas noise
- WebGL image noise
- Audio noise
- font behavior
- ClientRects behavior
- timezone runtime identity
- fingerprint seed and seed-derived hardware diversity
- WebRTC IP replacement when Duokai supplies a verified IP

### Duokai owns

- stable profile/hardware identity used to derive the seed
- resolved locale, timezone and geolocation
- verified proxy egress IP
- policy validation and fail-closed decisions
- profile locale Preferences preparation
- mapping version and mapping hash

### Forbidden after formal Cloak integration

The legacy fingerprint init script must not be installed into a Cloak context. The mapping result records:

```text
legacyInitScriptPolicy=forbidden
```

## 3. Implemented files

### Added

- `electron/services/cloakBrowserFingerprint.ts`
- `electron/services/cloakBrowserFingerprint.test.ts`
- `scripts/run-cloak-fingerprint-smoke.ts`

### Modified

- `electron/services/cloakBrowserRuntime.ts`
- `electron/services/cloakBrowserRuntime.test.ts`
- `package.json`

The new npm command is:

```text
smoke:cloak-fingerprint
```

## 4. Stable mapping design

### Seed derivation

The seed source priority is:

1. `runtimeMetadata.hardwareSeed`
2. `runtimeMetadata.hardwareProfileId`
3. profile ID

The selected value is deterministically hashed into a positive 31-bit integer. The final real smoke used:

```text
fingerprintSeed=1041589418
```

This avoids the collision pressure of the wrapper's default five-digit random seed space while remaining a valid Cloak seed.

### Browser identity

The mapping blocks a profile when any of these conflicts with the pinned Cloak Chromium major:

- `advanced.browserVersion`
- `advanced.browserKernelVersion`
- Chrome major in User-Agent

The User-Agent operating-system family must also match the selected Cloak platform.

### Native mapped arguments

The verified mapping can produce:

- `--fingerprint-platform`
- `--fingerprint-hardware-concurrency`
- `--fingerprint-device-memory`
- `--fingerprint-screen-width`
- `--fingerprint-screen-height`
- `--fingerprint-taskbar-height`
- `--fingerprint-brand`
- `--fingerprint-brand-version`
- `--fingerprint-platform-version`
- `--fingerprint-location`
- `--fingerprint-noise=false`
- explicit `--fingerprint-webrtc-ip`
- WebRTC handling policy
- `--disable-webrtc`
- `--enable-do-not-track`

The master `--fingerprint=<seed>` is added exactly once by the Runtime adapter.

### GPU policy

Legacy WebGL vendor and renderer fields are never explicitly mapped, even when they appear platform-coherent. Cloak seed-derived GPU identity is required so different profiles retain native hardware diversity.

### Locale preparation

Real macOS testing showed that `--lang` and `--fingerprint-locale` alone did not replace the host language stored in a fresh persistent profile. Before launch, the adapter now atomically merges:

```text
Default/Preferences
intl.accept_languages
intl.selected_languages
```

For `en-US`, the stored value is:

```text
en-US,en
```

No JavaScript navigator override is used.

### Geolocation

Cloak receives the same resolved coordinates through:

- native `--fingerprint-location`
- Playwright persistent-context geolocation

The values must match. This is not a JavaScript injection and was required for the real Geolocation API to return the configured coordinates on the tested build.

## 5. Fail-closed rules

The mapping blocks:

- Android or iOS device mode
- non-Chrome browser kernel
- browser-version mismatch
- User-Agent platform mismatch
- `randomizeFingerprintOnLaunch=true`
- any legacy fingerprint mode set to `random`
- partial off/custom combinations for Canvas, WebGL image, Audio and ClientRects
- unresolved locale/timezone/geolocation when automatic resolution is enabled
- invalid BCP 47 locale
- invalid IANA timezone
- invalid geolocation
- invalid CPU or memory values
- proxy-aware non-direct profiles without a verified egress IP
- automatic `--fingerprint-webrtc-ip=auto`
- untrusted or unknown mapped fingerprint arguments
- user launch arguments that try to override native fingerprint ownership

For Cloak Chromium 145, Canvas, WebGL image, Audio and ClientRects noise can only be disabled as one global native policy. If all four legacy modes are `off`, the mapper emits:

```text
--fingerprint-noise=false
```

A partial mixture is rejected.

## 6. Compatibility warnings

The mapper reports rather than silently fabricates unsupported equivalence:

- media-device custom values have no explicit Cloak 145 mapping flag; native output is retained
- speech-voice custom values have no explicit Cloak 145 mapping flag; native output is retained
- WebGL metadata cannot be independently disabled while retaining other native identity
- `deviceInfoMode=off` cannot disable Cloak native UA and Client Hints
- device name, host IP and MAC address are not browser-exposed Cloak mapping inputs
- memory values are normalized to Chromium-exposed buckets `1`, `2`, `4` or `8` GB
- legacy GPU values are ignored in favor of seed-derived GPU identity

## 7. Automated verification

Final unit and type verification results:

- Runtime, identity and fingerprint tests: `31/31` passed
- Electron/Node TypeScript project check: passed
- standalone fingerprint smoke TypeScript check: passed
- `git diff --check`: passed

The tests cover:

- deterministic mapping and mapping hash
- different hardware identities producing different seeds
- 31-bit seed range
- browser-major and User-Agent platform consistency
- unstable-mode rejection
- partial native-noise policy rejection
- global noise-disable mapping
- verified WebRTC IP requirements
- locale, timezone and geolocation validation
- CPU and memory validation/normalization
- GPU legacy-value warnings
- trusted mapped-argument allowlist
- profile locale Preferences merging
- fail-closed Runtime behavior

## 8. Real Cloak fingerprint smoke

The final smoke launched three real persistent contexts:

1. first launch using stable hardware seed A
2. second launch using the same seed A
3. third launch using different seed B

Final result:

```text
success=true
sameSeedStable=true
differentSeedDistinct=true
nativeIdentityMatches=true
geolocationMatches=true
legacyInjectionAbsent=true
```

Verified identity included:

- User-Agent: Chrome `145.0.0.0`
- UA Client Hints full version: `145.0.7632.109`
- platform: `MacIntel`
- UA Client Hints platform: `macOS`, architecture `arm`, bitness `64`
- language: `en-US`
- languages: `en-US,en`
- timezone: `America/Los_Angeles`
- hardware concurrency: `8`
- device memory: `8`
- screen: `1440x900`
- webdriver: `false`
- geolocation: `34.0522,-118.2437`, accuracy `20`
- legacy injection marker: absent

Same-seed results retained the same GPU and Canvas pixel hash. The different seed produced both a different seed-derived Apple GPU model and a different Canvas pixel hash.

Final retained smoke root:

```text
/var/folders/dp/7fv6ywm16_qcsy27m9pw25tc0000gn/T/duokai-cloak-fingerprint-KC34RR
```

## 9. Regression and build verification

After Phase 2 changes:

- Phase 1 persistent-context smoke passed again
- Cookie and LocalStorage persistence remained intact
- Popup, download and storageState remained intact
- runtime binary identity remained stable
- ordinary Chromium fallback remained absent
- Electron macOS arm64 directory build passed

## 10. Existing profile migration requirements

The current Duokai profile defaults cannot be connected directly without a migration/normalization step:

1. Existing defaults commonly advertise Chrome `147`, while the pinned Cloak runtime is Chromium `145`.
2. The current default has `clientRectsMode=off` while Canvas, WebGL image and Audio are `custom`; this is a partial noise policy and is intentionally blocked.
3. Any profile using a `random` fingerprint mode must be converted to a stable native policy.
4. Legacy GPU vendor/renderer fields must stop being treated as authoritative runtime values.
5. Resolved locale, timezone and geolocation must be available before mapping.
6. Non-direct proxy-aware profiles must provide a verified egress IP before launch.
7. Media-device and speech-voice custom settings must be represented as native-only compatibility behavior rather than JS overrides.
8. The legacy init script must be removed from the Cloak launch path atomically with the formal runtime switch.

These requirements belong to a later migration/integration phase. Phase 2 did not mutate stored profiles.

## 11. Phase decision

**Decision: Phase 2 passed.**

A stable, versioned and fail-closed mapping from Duokai profile identity to Cloak native parameters has been implemented and verified with the real browser. The tested mapping preserves identity across relaunches, distinguishes different profile seeds, aligns browser and environment fields, and avoids duplicate JavaScript fingerprint injection.

This approval does not yet authorize replacing the formal Duokai launch path. Formal integration must first add profile normalization/migration, connect verified network identity, remove the legacy init script from Cloak contexts, and update runtime/trusted evidence atomically.
