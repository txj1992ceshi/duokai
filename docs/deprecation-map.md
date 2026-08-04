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

Phase 7B retired every official entrypoint that could launch or call the standalone `fingerprint-dashboard/stealth-engine` Runtime:

- Dashboard start/stop/status now use control-plane tasks and Agent heartbeat state only
- legacy runtime actions and browser-layer proxy checks return HTTP `410` and fail closed
- Electron no longer exposes or spawns a local `3101` Runtime
- root launch/install scripts no longer install Playwright Chromium or start the old service
- PM2, deployment and CI no longer define or deploy `duokai-runtime`

Phase 7C physically deleted the complete `fingerprint-dashboard/stealth-engine` tree: 1,835 tracked files and 31,241,130 bytes, including its committed dependency tree, package metadata and executable sources. Four direct-Runtime test clients and the dedicated Playwright Dockerfile were deleted with it. The authenticated HTTP `410` routes remain only as non-executing tombstones for explicit migration errors.

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

Deprecated executable paths have now been physically removed. Going forward:

- the `fingerprint-dashboard/stealth-engine` directory, its dedicated Docker image and direct-Runtime test clients must not be recreated
- HTTP `410` tombstone routes must never gain an executor, child process, Runtime URL or compatibility fallback
- no new feature may introduce server-side browser execution or ordinary Playwright Chromium
- all runtime work must use control-plane tasks and the registered Duokai desktop Agent
- browser execution must remain CloakBrowser-only and fail closed when the Agent is unavailable
- repository guards must keep the removed directory, `RUNTIME_URL` forwarding layer, port `3101` service and `duokai-runtime` deployment definition absent
