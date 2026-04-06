# Duokai IP Usage Mode

## Summary

Duokai supports two explicit profile-level IP usage modes:

- `dedicated`
- `shared`

This is a controlled product feature.
User choice is preserved, but final launch approval remains in the control plane.

`proxyBindingMode` is now a legacy compatibility field for lower-level proxy behavior.
Launch approval must read `ipUsageMode`, platform policy, lease state, and proxy asset sharing capability.

## Canonical Decision Inputs

Before a `PROFILE_START` task is created, the control plane resolves:

- profile
- active lease
- proxy asset
- platform-purpose policy
- current active leases on the same asset or egress IP
- current running profiles using the same asset/IP

## Profile Field

`Profile.ipUsageMode`

- `dedicated`: one IP should be used for one environment only
- `shared`: one IP may be reused by multiple environments, but only within system limits

Defaulting:

- `register` -> `dedicated`
- `nurture` / `operation` -> `shared` when policy allows, otherwise `dedicated`

## Proxy Asset Fields

`ProxyAsset.sharingMode`

- `dedicated`
- `shared`
- `hybrid`

Additional capacity fields:

- `maxProfilesPerIp`
- `maxConcurrentRunsPerIp`

Defaulting for legacy assets:

- `sharingMode = dedicated`
- `maxProfilesPerIp = 1`
- `maxConcurrentRunsPerIp = 1`

## Platform Policy Fields

`proxyPolicy` must expose:

- `allowedIpUsageModes`
- `defaultIpUsageMode`
- `sharedIpMaxProfilesPerIp`
- `sharedIpMaxConcurrentRunsPerIp`

Default policy behavior:

- `register`: dedicated only
- `nurture`: shared allowed
- `operation`: shared allowed

## Launch Blocking Codes

The control plane may reject launch before task creation with explicit reason codes:

- `NO_ACTIVE_LEASE`
- `LEASE_NOT_ACTIVE`
- `LEASE_COOLDOWN`
- `PROXY_ASSET_COOLDOWN`
- `IP_USAGE_MODE_NOT_ALLOWED`
- `PROXY_SHARING_UNSUPPORTED`
- `DEDICATED_IP_CONFLICT`
- `SHARED_IP_PROFILE_LIMIT`
- `SHARED_IP_CONCURRENT_LIMIT`

These codes are intended for:

- dashboard user-facing feedback
- admin task diagnostics
- audit and task-event visibility

## Usage Counters

Proxy asset usage is derived, not stored as a second source of truth.

Current summary fields include:

- `boundProfilesCount`
- `activeLeasesCount`
- `runningProfilesCount`
- `affectedProfileIds`

These values are derived from:

- profiles bound to the proxy asset
- active lease records
- current agent runtime status

## Product Rules

- Users may choose `dedicated` or `shared`
- The system must never silently downgrade or silently switch the selected mode
- Shared mode is only valid when policy and proxy asset capability both allow it
- Cooldown rules always remain authoritative
- Shared IP reuse is bounded, never unlimited
