# Single-Owner Project Governance

Effective date: 2026-08-04

## Ownership model

Duokai is maintained by one project owner. The project does not require a second reviewer, a distinct operator/reviewer pair, a separate release director, or a separate rollback owner. High-risk actions require an explicit confirmation from the project owner that binds the action to the exact target SHA, Profile, rollout, release, or rollback operation.

## GitHub merge protection

The `main` branch must retain strict up-to-date status checks, conversation resolution, admin enforcement, force-push prevention and branch-deletion prevention. The required machine checks are:

- `agent-contract`
- `deploy-policy`
- `desktop-release-policy`
- `candidate-closure`

Human approval counts and last-push approval by another person are not merge gates. A merge is allowed only when the exact candidate SHA passes every required machine gate, unresolved review threads are zero, and the project owner explicitly confirms the merge.

## Profile promotion

Profile promotion does not require separate operator and reviewer identities. The project owner must explicitly confirm the exact Profile, rollout, batch and evidence set after the latest Observe evidence was produced.

The owner confirmation never replaces technical admission criteria. Promotion to `enforce` remains fail-closed unless all configured checks pass, including:

- at least 3 successful Observe samples;
- at least 30 minutes of Observe coverage;
- zero failed samples;
- latest evidence no older than 30 minutes;
- latest outcome successful;
- exact pinned browser version and binary SHA256;
- single-Profile and single-batch constraints;
- clean runtime, kill-switch and rollback state.

No test, sample, approval, deployment, signature, notarization or installation evidence may be fabricated.

## Deployment and release

Merge, production deployment, Profile rollout and signed desktop publication are separate owner-authorized actions. Production deployment must target the exact current `main` SHA and must not enable Profile rollout. Signed releases still require real Apple and Windows credentials, signature verification, notarization, clean-install testing, upgrade testing, immutable versioning and a recorded rollback plan.

A failed TCP/SSH connectivity probe is a network or infrastructure blocker until proven otherwise; it must not be described as a successful deployment or as a deployment-code failure without supporting evidence.
