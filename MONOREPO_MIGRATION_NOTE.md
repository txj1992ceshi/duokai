# Monorepo Migration Note

## What changed

- `duokai2` has been merged into this repository as:
  - `apps/duokai2`
- Merge method: `git subtree add --prefix apps/duokai2 <duokai2> main`
- Result: full `duokai2` commit history is preserved in this repo.

## Existing main modules

- `duokai-api`
- `duokai-admin`
- `apps/duokai2`

## Suggested next actions

1. Push this repository to GitHub (`duokai`) after validating CI.
2. Mark `duokai2` GitHub repository as archived (read-only) to prevent drift.
3. Update local/CI scripts that previously referenced `/Users/jj/Desktop/duokai2` to use `apps/duokai2`.
