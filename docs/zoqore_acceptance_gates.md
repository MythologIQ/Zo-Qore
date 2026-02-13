# Zo-Qore Acceptance Gates

## Purpose

Define stage gates for Zo-Qore execution with explicit fail criteria and evidence requirements.

## Gate 1: Security Baseline

Required:
1. Public UI requires authentication and MFA.
2. Session revocation path is available and testable.
3. Auth and MFA failure lockouts are enforced.
4. Security headers are present on UI/API responses.

Fail Conditions:
- Any unauthenticated access to protected UI/API routes.
- Session revocation command unavailable or non-functional.
- Lockout controls absent or bypassable.

Evidence:
- Source references in `zo/ui-shell/server.ts`
- Targeted tests in `tests/zo.ui.shell.test.ts` and `tests/zo.ui.mfa.test.ts`

## Gate 2: Control Plane Baseline

Required:
1. `qorectl doctor` reports runtime and UI posture.
2. `qorectl sessions` and `qorectl devices` expose active auth surface.
3. `qorectl revoke-sessions` and `qorectl mfa-reset` execute against admin API.
4. Commands have deterministic exit codes for automation.

Fail Conditions:
- Missing command path or ambiguous command failures.
- Non-actionable diagnostics.

Evidence:
- `scripts/qorectl.mjs`
- `package.json` command wiring
- `tests/zo.ui.shell.test.ts`

## Gate 3: Install and Operability

Required:
1. Full installer can complete from clean Zo environment.
2. Installer supports interactive and non-interactive modes.
3. Installer can recreate existing service labels safely when requested.

Fail Conditions:
- Incomplete install requiring undocumented manual patching.
- No clear remediation when services already exist.

Evidence:
- `deploy/zo/install-zo-full.sh`
- `deploy/zo/TAKE_THIS_AND_GO.md`

## Gate 4: Governance Continuity

Required:
1. Runtime evaluation behavior remains stable.
2. Existing governance adapters retain contract behavior.
3. No cross-module regressions from control-plane additions.

Fail Conditions:
- Runtime API regression (`/health`, `/policy/version`, `/evaluate`).
- Governance routing behavior changes without planned migration.

Evidence:
- Existing baseline tests
- CI/local `typecheck`, `test`, `build`

## Gate 5: Adversarial Review Loop

Required:
1. Findings logged by severity.
2. Remediation actions mapped to findings.
3. Iterative pass state reached with no open `high` findings.

Fail Conditions:
- Findings not remediated or untracked.
- No explicit pass/fail statement.

Evidence:
- `docs/zoqore_adversarial_sprint1.md` (planned)

## Gate Evaluation Protocol

1. Run `npm run typecheck`.
2. Run targeted tests for changed surfaces.
3. Run `npm run build`.
4. Execute control-plane commands in dry run and live mode.
5. Record results and decision in adversarial artifact.

