# Duokai Deprecation Map

## Deprecated Direction

These paths conflict with the next architecture and should be treated as deprecated:

- any route or script path that implies server-side browser execution for end users
- any default persistence path that stores full storageState bodies in MongoDB
- any default persistence path that stores full snapshot bodies in MongoDB
- task types that imply scripted platform automation
- terminology that suggests automatic social actions

## Current Repo Hotspots

### Server-side launch bypass

The legacy runtime launch path that shells into `fingerprint-dashboard/stealth-engine/launch.js` conflicts with the canonical server -> agent -> local runtime flow.

Target state:

- keep only task-driven local execution
- return a clear deprecation response for legacy direct launch paths

### Mongo inline runtime state

`ProfileStorageState.stateJson` is a legacy inline body path.

Target state:

- metadata-first storage records
- optional compatibility inline payload only
- file-backed cloud artifacts for larger bodies

### Mongo inline snapshot bodies

Workspace snapshot records currently allow full inline bodies.

Target state:

- manifest-first records in Mongo
- body storage in local runtime and optional Vultr file repository

### Automation-adjacent naming

Any hidden task type or UI wording that suggests automated platform actions should be removed or renamed toward manual environment management terminology.

## Migration Rule

Deprecated paths may remain temporarily for compatibility, but:

- no new features should be built on them
- all new runtime work must use the canonical architecture
- deprecation should be reflected in route responses, docs, and types
