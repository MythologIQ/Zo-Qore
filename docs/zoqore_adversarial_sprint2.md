# Zo-Qore Adversarial Review: Sprint 2

## Scope

- Control-plane expansion in `scripts/qorectl.mjs`
- Admin/session hardening in `zo/ui-shell/server.ts`
- Public-launch safety in `deploy/zo/one-click-standalone.sh`
- UI sync durability in `scripts/sync-failsafe-ui.mjs`

## Findings

1. `medium`: Public standalone launch could expose admin routes if users bind `0.0.0.0` without auth variables.
- Remediation: enforce required Basic Auth, MFA secret, and admin token checks for public bind in `deploy/zo/one-click-standalone.sh`.
- Status: `closed`

2. `medium`: Session revocation operation was too coarse (`all/current` only), slowing incident response.
- Remediation: add session and device targeting in server and `qorectl`.
- Status: `closed`

3. `low`: MFA recovery existed only as manual env replacement, with no audited runtime control-plane path.
- Remediation: add `POST /api/admin/mfa/recovery/reset` with explicit confirmation token and full session revocation.
- Status: `closed`

4. `low`: Full UI synchronization depended on a fixed file list, risking drift when upstream UI adds files.
- Remediation: switch to directory-level sync from local source or sparse-cloned upstream repo path.
- Status: `closed`

## Validation Evidence

- `npm run typecheck`: pass
- `npm test -- --run tests/zo.ui.shell.test.ts tests/zo.ui.mfa.test.ts`: pass
- `npm run lint`: pass
- `npm run build`: pass
- `bash -n deploy/zo/one-click-standalone.sh`: pass
- `node scripts/qorectl.mjs --help`: pass

## Pass State

- Open `high` findings: `0`
- Open `medium` findings: `0`
- Gate decision: `PASS`

## Phase 3 Entry Notes

Recommended focus for next sprint:
1. Backup and restore lifecycle (ledger, replay DB, auth posture snapshot).
2. Upgrade-safe migration script with preflight and rollback hooks.
3. Operator runbook automation for incident rotation flows.

