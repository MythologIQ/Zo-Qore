# Bootstrap Checklist

## Repository Isolation

- `git rev-parse --show-toplevel` equals `g:/MythologIQ/FailSafe-Qore`
- `git remote -v` includes `https://github.com/MythologIQ/Zo-Qore.git`

## Tool Versions

- `node -v` (Node 20+)
- `npm -v`

## Baseline Validation

- `npm run typecheck`
- `npm test`
- `npm run build`
- Confirm Zo-native documentation status is current in `docs/DOCUMENTATION_STATUS.md`

## Pre-commit Guard

- Run typecheck + tests before commit.
- Do not introduce `vscode` runtime imports into core modules.
- For Zo-specific work, apply gates in `docs/ZO_ASSUMPTIONS_AND_GATES.md`.
