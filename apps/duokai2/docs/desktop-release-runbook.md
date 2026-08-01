# Desktop Signed Release and Rollback Runbook

## Purpose

This runbook controls formal macOS and Windows releases. Test packages, unsigned artifacts and CI smoke outputs are not release candidates.

## Required roles and credentials

A release requires a distinct release director and rollback owner. The execution agent, code author and repository owner cannot silently substitute for an independent approval required by the release plan.

Required GitHub Actions secrets:

- `MACOS_CSC_LINK`
- `MACOS_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`
- `WINDOWS_CSC_LINK`
- `WINDOWS_CSC_KEY_PASSWORD`

Do not paste credential values into issues, PR comments, logs, evidence directories or repository files.

## Candidate preparation

1. Merge the reviewed PR with a merge commit after the exact latest head has an independent approval.
2. Complete the exact-SHA production deployment and health checks separately; server deployment must not enable Profile rollout.
3. Keep Pilot disabled and rollout `off` until Phase 9 promotion gates pass.
4. Increase `apps/duokai2/package.json` to a stable semantic version higher than the latest published desktop release. The current `v3.6.8` tag and release are immutable and must never be replaced.
5. Create a release PR containing only the reviewed version/update metadata changes. Complete automated checks and independent approval.

## Signed draft creation

Run the `Desktop Release` workflow against the exact current `main` SHA. Supply:

- `expected_sha`: the exact 40-character lowercase SHA at `origin/main`;
- `release_tag`: exactly `v` plus the package version;
- `confirmation`: exactly `CREATE_SIGNED_DESKTOP_DRAFT`.

The workflow must fail closed when the SHA moves, the tag or release already exists, the version is not newer than the latest published release, any signing secret is missing, macOS signature/notarization validation fails, or Windows Authenticode validation fails.

The workflow creates a **Draft** only. It does not mark the draft latest and does not publish it.

## Draft verification

Before publication, the release director and rollback owner record:

- draft URL and target commit;
- macOS DMG/ZIP and Windows installer/ZIP SHA256 values;
- `codesign`, Gatekeeper and stapler validation results;
- Windows installer and ZIP-contained executable Authenticode results;
- updater manifest contents and package hashes;
- clean-install smoke results on one supported macOS host and one supported Windows host;
- upgrade test from the latest published version;
- Pilot empty allowlist, rollout `off` and kill-switch state after installation;
- the rollback decision window and named responders.

Only the release director may publish the verified draft through GitHub. Publication is a distinct human action; do not automate it from the build workflow.

## Release immutability

Published tags and assets are immutable. Never replace, delete or silently regenerate assets for an existing version. A changed binary, manifest, certificate or updater payload requires a higher semantic version and a new tag.

## Rollback strategy

Desktop auto-update is monotonic. Clients must not be forced to downgrade to an older semantic version, and an existing release must not be mutated to simulate rollback.

For a source or server regression:

1. name the release director and rollback owner;
2. revert the responsible merge commit in a reviewed PR;
3. merge the revert and deploy the exact resulting `main` SHA using the manual production workflow;
4. repeat server health checks and preserve Profile rollout in fail-closed state.

For a shipped desktop regression:

1. stop further rollout and enable the appropriate kill switches;
2. prepare a corrective source revert or fix;
3. increment to a **higher semantic version** than the bad release;
4. create and independently verify a new signed Draft using the full workflow;
5. test upgrade from both the previous good version and the bad version;
6. publish only after the release director authorizes the new corrective release;
7. preserve the bad release evidence and mark it affected; do not delete or replace its assets.

If signing credentials, notarization, Authenticode verification, updater tests, release director approval or rollback ownership are unavailable, the formal release remains NO-GO.
