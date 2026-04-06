# Duokai Runtime Flow

## Canonical Start Flow

1. User requests launch from desktop UI or control plane UI.
2. Control plane resolves the target profile, active lease, proxy asset, and platform-purpose policy.
3. Control plane validates:
   - selected `ipUsageMode`
   - proxy asset sharing capability
   - lease availability and active state
   - cooldown rules
   - active same-IP and same-asset conflicts
   - shared-IP profile and concurrent-run limits
4. If any hard block exists, control plane rejects launch with an explicit reason code and records the blocked decision.
5. If validation passes, control plane creates a `start` control task for a target desktop agent.
6. Desktop agent claims the task.
7. Desktop runtime loads the target profile, policy, workspace manifest, and lease data.
8. Runtime validates:
   - profile state
   - lease validity
   - cooldown rules
   - workspace isolation
   - launch lock
   - environment consistency
9. Runtime launches the local browser environment.
10. Runtime records status and compact events.
11. Runtime updates trusted launch and snapshot metadata when appropriate.

## Canonical Stop Flow

1. User requests stop.
2. Control plane creates a `stop` task.
3. Desktop agent claims the task.
4. Runtime resolves the active local process and lock.
5. Runtime stops the process, updates status, and clears lock state.
6. Compact events and audit records are written back.

## Snapshot And Restore Flow

Snapshot:

1. Runtime validates workspace and storage state.
2. Runtime creates local snapshot body.
3. Runtime writes manifest metadata.
4. Optional file-backed cloud backup is uploaded.

Restore:

1. User chooses restore source.
2. Runtime validates compatibility and current lock state.
3. Runtime restores from:
   - current local state fallback
   - local trusted snapshot
   - cloud backup
4. Runtime clears prior trusted launch reuse state and quick isolation cache.
5. Runtime runs post-restore verification.
6. Runtime records success or invalidation reason.

Post-restore trust rules:

- restore or rollback never silently keeps the previous trusted launch baseline active
- restored environments must pass a fresh isolation preflight before trusted launch reuse resumes
- last quick isolation metadata is reset after recovery so stale trust cannot survive a workspace rewind

## Failure Principles

All runtime failures must map to explainable reasons, including:

- no valid lease
- lease cooling down
- IP usage mode not allowed by policy
- proxy asset does not support shared mode
- shared IP profile limit reached
- shared IP concurrent run limit reached
- duplicate launch
- workspace contamination
- unsupported runtime mode
- snapshot mismatch
- agent offline
- policy block

## Runtime Modes

- `local`: production-ready file and process isolation
- `strong-local`: stricter local isolation when supported
- `vm`: declared contract only until real implementation exists
- `container`: Linux-only contract only until real implementation exists

Unimplemented modes must not pretend to be active.
