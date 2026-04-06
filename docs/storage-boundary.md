# Duokai Storage Boundary

## Goal

Keep MongoDB compact and bounded while making Vultr SSD the artifact store and keeping the local machine as runtime state owner.

## Local Desktop Runtime

Local runtime is the primary source of truth for:

- browser user data
- workspace directory layout
- storageState working copy
- trusted local snapshots
- local logs

These must not be relocated to MongoDB.

## MongoDB

MongoDB stores metadata only.

Allowed categories:

- users
- agents
- profiles
- proxy assets
- IP leases
- control tasks
- compact task events
- platform policies
- workspace manifests
- snapshot manifests
- storage state metadata
- compact audit records

MongoDB must not be the default long-term store for:

- full storageState JSON bodies
- full snapshot bodies
- runtime browser files
- large diagnostics bundles

## Vultr File Repository

Large artifacts are stored as file-backed objects on Vultr SSD.

Every file-backed object must have metadata including:

- fileRef
- checksum
- size
- contentType
- retentionPolicy
- createdAt

Primary artifact classes:

- storage-state-backup
- workspace-snapshot
- import-export-bundle
- task-output
- diagnostics
- runtime-log
- mongo-backup
- release-artifact

## Compatibility Rule

During migration, inline JSON bodies may still appear in APIs for backward compatibility, but:

- new writes should prefer metadata-first payloads
- inline bodies should be treated as transitional
- clients should migrate toward fileRef + metadata

## API Read Rule

Storage-state and workspace-snapshot read APIs should return metadata-first payloads by default.

- default GET responses should expose metadata, checksums, fileRef, version, timestamps, and compact storage state summaries
- large inline content should only be returned when the caller explicitly requests it with `includeContent=1`
- desktop restore flows and manual login-state inspection may request full content explicitly
- list and summary views should stay metadata-only by default

## Retention Baseline

- task events: 3-7 days
- agent sessions: 1-3 days
- control tasks: about 7 days
- compact audit logs: 15-30 days
- storage state backups: latest by default
- snapshots: recent N per profile

## Source of Truth Order

1. Current local runtime state
2. Local trusted snapshot
3. Vultr cloud backup

Cloud backups are recovery aids, not the primary runtime truth.
