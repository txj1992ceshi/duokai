# Duokai CloakBrowser Phase 3 Network Identity Report

**Date:** 2026-07-27
**Workspace:** `~/Documents/duokai-cloakbrowser-phase1-poc`
**Branch:** `codex/cloakbrowser-phase1-poc`
**Status:** Passed
**Target runtime:** CloakBrowser wrapper `0.5.2`, Chromium package `145.0.7632.109.2`, runtime `145.0.7632.109`

## 1. Scope protection

Phase 3 was implemented and verified only in the isolated sibling worktree. It did not switch the formal profile launch path and did not modify real profile data, proxy credentials, database records, workspace metadata or trusted snapshots.

The following production-path files remained unchanged:

- `apps/duokai2/electron/main.ts`
- `apps/duokai2/electron/services/fingerprint.ts`
- `apps/duokai2/electron/services/proxyCheck.ts`
- `apps/duokai2/electron/services/workspaceRuntime.ts`
- `apps/duokai2/electron/services/trustedLaunch.ts`
- `apps/duokai2/electron/services/factories.ts`
- `apps/duokai2/electron/services/profileValidator.ts`
- `apps/duokai2/src/shared/types.ts`

No commit or merge was created.

## 2. Audit findings

The current production `proxyCheck.ts` still launches an ordinary Playwright Chromium instance through `resolveChromiumExecutable()`. That is incompatible with the final single-engine target, but it was intentionally left untouched in this phase to avoid a partial production switch.

The existing `proxyBridge.ts` already provides the required transport primitive: HTTP, HTTPS and SOCKS5 upstream proxies can be exposed as a local HTTP bridge suitable for a browser context. The missing layer was a structured identity decision that binds all of the following before Cloak launch:

1. selected proxy record;
2. prepared loopback bridge transport;
3. successful and fresh egress-check result;
4. IP protocol policy;
5. WebRTC policy;
6. locale, timezone and geolocation derived from the verified network result.

Phase 3 adds that binding as an isolated module without replacing the formal proxy-check path.

## 3. Implemented files

### Added

- `apps/duokai2/electron/services/cloakBrowserNetwork.ts`
- `apps/duokai2/electron/services/cloakBrowserNetwork.test.ts`
- `apps/duokai2/scripts/run-cloak-network-smoke.ts`
- `apps/duokai2/docs/cloakbrowser/phase-3-network-identity-report.md`

### Modified

- `apps/duokai2/electron/services/cloakBrowserRuntime.ts`
- `apps/duokai2/electron/services/cloakBrowserRuntime.test.ts`
- `apps/duokai2/package.json`

The new npm command is:

```text
smoke:cloak-network
```

## 4. Network identity model

`buildCloakNetworkMapping()` produces a versioned mapping that contains:

- profile ID and proxy mode;
- proxy ID, protocol and credential-free endpoint description;
- credential-free proxy fingerprint hash;
- prepared local bridge configuration;
- verified egress IP and metadata;
- parsed geolocation;
- IPv4/IPv6 policy;
- WebRTC mode and verified WebRTC IP;
- mapped Cloak network arguments;
- compatibility warnings;
- deterministic mapping hash.

The mapping hash deliberately excludes the ephemeral loopback bridge address. Proxy usernames and passwords are excluded from both the mapping object and all hashes. Only the fact that authentication is configured is included in the proxy fingerprint.

## 5. Fail-closed rules

### Proxy-bound profile

A proxy-bound mapping is rejected unless all of these are true:

- a valid proxy record is present;
- the egress check succeeded;
- the egress result source is `proxy`;
- the egress result is within the configured freshness window;
- the checked egress path matches the prepared transport path;
- the prepared browser transport is an HTTP URL on `localhost`, `127.0.0.1` or `::1` with an explicit port;
- neither the bridge URL nor the browser proxy object contains credentials;
- the verified egress IP is syntactically valid and matches the configured IPv4/IPv6 policy;
- timezone and language metadata are present.

Raw upstream HTTP proxy URLs, direct SOCKS URLs, non-loopback endpoints and credential-bearing URLs are rejected before wrapper launch.

### Direct profile

A direct mapping is rejected when it carries a hidden proxy record, an active bridge, a proxy-sourced egress result or a non-direct egress path.

### WebRTC

- `disabled` maps to `--disable-webrtc`.
- `proxy-aware` maps to:

```text
--force-webrtc-ip-handling-policy=disable_non_proxied_udp
--fingerprint-webrtc-ip=<verified egress IP>
```

- `default` is blocked for proxy-bound profiles.
- automatic WebRTC IP resolution remains forbidden.

## 6. Runtime proxy boundary

`CloakRuntimeLaunchRequest` now accepts a proxy object, but the runtime independently revalidates it. The wrapper receives only a prepared loopback HTTP bridge. It cannot receive raw upstream proxy credentials through this path.

This keeps responsibility separated:

- Duokai owns upstream proxy authentication and bridge lifecycle.
- CloakBrowser receives only the local transport endpoint.
- the network mapping owns the verified relationship between proxy, egress identity and WebRTC policy.

## 7. Automated tests

The combined Runtime, identity, fingerprint and network suite contains `42` tests.

Network-specific coverage includes:

- deterministic proxy/egress/WebRTC binding;
- credential exclusion from objects and hashes;
- direct-profile consistency;
- proxy source and transport-path consistency;
- raw upstream and credential-bearing transport rejection;
- failed, stale and future egress result rejection;
- invalid IP and IPv4/IPv6 mismatch rejection;
- proxy-bound default WebRTC rejection;
- WebRTC-disabled mapping;
- optional geolocation behavior;
- replacement of stale WebRTC arguments in a launch request;
- runtime-level loopback proxy validation.

Final result:

```text
42/42 passed
```

TypeScript validation also passed with `tsconfig.node.json --noEmit`.

## 8. Real Cloak network smoke

The real smoke used only:

- a temporary profile and downloads directory;
- the already installed Cloak Chromium package;
- an ephemeral local HTTP target server;
- an ephemeral local HTTP proxy server;
- fake sentinel proxy credentials that were never supplied to the browser;
- documentation-only egress IP `203.0.113.25`;
- no real proxy account, real profile or user data.

The test navigated to `http://phase3-network.test/probe`. That hostname has no direct fixture resolution; the page can load only when the browser sends the absolute HTTP request through the local proxy, which then forwards the request to the local target server.

Final routing evidence:

```text
proxyRequestHits=2
proxyConnectHits=0
targetRequestHits=2
fixtureLoadedThroughProxy=true
proxyAuthorizationObserved=false
```

The loaded page returned:

```text
PHASE3_NETWORK_PROXY_OK
```

Observed runtime identity:

```text
wrapper=0.5.2
requestedPackage=145.0.7632.109.2
installedPackage=145.0.7632.109.2
runtimeChromium=145.0.7632.109
binarySha256=79ddf7e7a7be8087319390ed79266387f6499b8a2e45ccfbaa724d7e7fff6b79
```

Observed browser network-related identity:

```text
navigator.language=en-US
navigator.languages=en-US,en
timezone=America/Los_Angeles
geolocation=34.0522,-118.2437
navigator.webdriver=false
legacyInjectionAbsent=true
```

Final smoke checks:

```text
networkIdentityBound=true
credentialRedactionPassed=true
runtimeProxyPassed=true
localeTimezonePassed=true
geolocationPassed=true
webrtcHostLeakAbsent=true
legacyInjectionAbsent=true
```

## 9. WebRTC observation limit

The local smoke intentionally used no external STUN or TURN service. In that environment Cloak Chromium produced an empty ICE candidate list. Therefore the test proved that no host or local-interface address was exposed, but it did not directly observe `203.0.113.25` inside an ICE candidate.

The verified IP was still bound into the validated launch mapping and wrapper arguments, and proxy-bound `default` WebRTC is fail-closed. A later integration stage should add a controlled STUN/TURN fixture if page-level candidate replacement must be demonstrated independently.

This limitation does not change the Phase 3 pass decision, but it must remain explicit evidence rather than being represented as a verified candidate substitution.

## 10. Execution-environment note

The initial Task Graph command sandbox rejected loopback server creation with:

```text
listen EPERM: operation not permitted 127.0.0.1
```

The same smoke was then run through the authorized local execution channel, where loopback listening is permitted. This was an execution sandbox boundary, not a CloakBrowser or application defect.

The host run also exposed and fixed a Node 22-only fixture issue: proxy headers must be deleted before forwarding instead of being assigned `undefined`.

## 11. Final regression and package audit

The final workspace version passed:

- `42/42` combined unit tests;
- TypeScript validation;
- Phase 1 persistent-context regression smoke;
- Phase 2 stable-fingerprint regression smoke;
- Phase 3 proxy/network smoke;
- Electron macOS arm64 `build:dir`;
- `npm ci --ignore-scripts --dry-run`;
- `git diff --check`.

The final ASAR inventory reported:

```text
cloakWrapperEntries=74
networkModuleEntries=0
fingerprintModuleEntries=0
cloakBinaryEntries=0
```

The wrapper dependency is available to the application package, but the separate Cloak binary is not bundled. The Phase 2 and Phase 3 isolated modules are absent from the formal application bundle because production integration has not occurred.

## 12. Phase decision

**Decision: Phase 3 passed.**

The isolated implementation now demonstrates that Duokai can bind a verified proxy egress identity, local bridge transport and WebRTC policy into a fail-closed CloakBrowser launch request without exposing upstream credentials.

The formal production launch and proxy-check paths remain unchanged. Production integration must wait until trusted runtime/network identity is defined and can be atomically recorded with the launch decision.
