# Duokai Next Architecture

## Summary

Duokai is a local-first matrix environment manager.

The system is composed of:

- A Vultr-hosted control plane
- A local desktop runtime that owns real browser execution
- MongoDB for compact metadata only
- Vultr SSD-backed file storage for large artifacts and backups

The control plane must never become the execution host for end-user browser environments.

## Canonical Runtime Ownership

The desktop app is the only runtime owner for profile launch, stop, snapshot, restore, verification, and open-platform flows.

The control plane is responsible for:

- authentication
- profile metadata
- proxy and IP asset metadata
- lease and cooldown policy
- IP usage mode policy (`dedicated` vs `shared`) and final launch approval
- task dispatch
- agent/device status
- audit trail
- compact runtime events
- artifact metadata

The control plane is not responsible for:

- running Chromium for end users
- storing primary browser user data directories
- holding full local workspace bodies as the default truth

## Canonical Data Ownership

Local desktop runtime owns:

- userDataDir
- cacheDir
- downloadsDir
- extensionsDir
- local workspace metadata working copy
- local storageState working copy
- local snapshots
- local runtime logs

Control plane owns:

- compact profile metadata
- policy definitions
- proxy asset sharing metadata and usage counters
- task records
- task events
- workspace manifests
- snapshot manifests
- storage state metadata
- lease metadata
- audit metadata

Vultr file storage owns:

- compressed storageState backups
- snapshot bodies
- import/export bundles
- diagnostics
- task outputs
- logs
- Mongo backups
- release artifacts

## Canonical Execution Flow

1. User creates or updates a profile in control plane or desktop UI.
2. Control plane stores compact metadata and policies.
3. Desktop agent syncs the latest config and policies.
4. User requests a runtime action.
5. Control plane resolves profile policy, lease, proxy asset sharing capability, cooldown state, and current IP usage counts.
6. Control plane either blocks launch with an explicit reason code or creates a control task.
7. The target desktop agent claims the task.
8. Local desktop runtime validates lease, policy, and workspace isolation.
9. Local desktop runtime executes the action.
10. Agent reports compact task events and audit data back to control plane.
11. Large artifacts are uploaded as file-backed objects, with only metadata stored in Mongo.

## Product Boundary

Duokai is a manual-only environment manager.

Allowed actions:

- create profile
- assign proxy
- acquire or release IP lease
- launch
- stop
- snapshot
- restore
- verify
- open target platform

Out of scope:

- automatic registration
- automatic posting
- automatic clicking
- automatic messaging
- automatic browsing
- scripted platform interaction
