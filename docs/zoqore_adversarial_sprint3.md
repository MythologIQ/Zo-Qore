# ZoQore Adversarial Review: Sprint 3

## Scope

- Resilience command implementation in `scripts/zo-resilience.mjs`
- Package command wiring in `package.json`
- Operator guidance updates in `README.md` and `deploy/zo/TAKE_THIS_AND_GO.md`

## Findings

1. `medium`: Restore operations can cause accidental overwrite without explicit operator intent.
- Remediation: require `--confirm RESTORE` for restore command.
- Status: `closed`

2. `medium`: Backup integrity can silently drift if copied files are tampered after backup.
- Remediation: manifest includes SHA-256 for each captured file and restore validates checksums before copy.
- Status: `closed`

3. `low`: Backup content scope could grow unsafely and capture large non-state artifacts.
- Remediation: capture path set constrained to runtime state files (ledger, replay DB, installer/auth config).
- Status: `closed`

## Validation Evidence

- `npm run typecheck`: pass
- `npm test -- --run tests/zo.ui.shell.test.ts tests/zo.ui.mfa.test.ts`: pass
- `npm run lint`: pass
- `npm run build`: pass
- `node scripts/zo-resilience.mjs backup`: pass
- `node scripts/zo-resilience.mjs list`: pass
- `node scripts/zo-resilience.mjs restore --confirm RESTORE --dry-run --from <latest>`: pass

## Pass State

- Open `high` findings: `0`
- Open `medium` findings: `0`
- Gate decision: `PASS`
