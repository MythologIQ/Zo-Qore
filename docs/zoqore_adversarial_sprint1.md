# Zo-Qore Adversarial Review: Sprint 1

## Scope

Sprint 1 review covered:
- control-plane baseline (`qorectl`)
- UI auth/MFA/session hardening paths
- installer and service registration security defaults

## Iteration 1 Findings

1. `high` IP-based allowlist and lockout logic trusted `x-forwarded-for` and `x-real-ip` unconditionally.
- Impact: direct clients could spoof source identity headers and bypass intended IP-policy semantics or evade lockout policy.
- Evidence: `zo/ui-shell/server.ts` `getClientIp` consumed proxy headers without trust boundary check.

2. `medium` `qorectl doctor` hard-failed when `QORE_UI_ADMIN_TOKEN` was not set.
- Impact: operational diagnostics could be blocked even when runtime and base UI health were valid.
- Evidence: `scripts/qorectl.mjs` marked `/api/admin/security` failure as fatal regardless of admin-token availability.

## Iteration 1 Remediation Applied

- Proxy header trust boundary hardening:
  - Added `QORE_UI_TRUST_PROXY_HEADERS` (default `false`).
  - Updated `getClientIp` to ignore proxy headers unless explicitly enabled.
  - File: `zo/ui-shell/server.ts`

- Control-plane doctor resilience:
  - Updated `qorectl doctor` to emit `WARN` and continue when `QORE_UI_ADMIN_TOKEN` is not set.
  - Full admin security check remains enabled when token is provided.
  - File: `scripts/qorectl.mjs`

- Documentation updates for operator safety:
  - Added `QORE_UI_TRUST_PROXY_HEADERS` guidance.
  - Files: `README.md`, `deploy/zo/TAKE_THIS_AND_GO.md`

## Iteration 1 Validation

Commands executed:
- `npm run typecheck`
- `npm test -- --run tests/zo.ui.shell.test.ts tests/zo.ui.mfa.test.ts`
- `npm run build`
- `node scripts/qorectl.mjs doctor`

Result:
- No open `high` findings in Sprint 1 scope.
- No open `medium` findings in Sprint 1 scope.

Final State: `pass`

## Residual Risks

1. Admin token transport still depends on secure secret handling by operator and host.
2. In-memory MFA session store is single-instance and not shared across scaled nodes.
3. UI admin endpoints currently rely on token and do not yet include scoped RBAC roles.

These residual risks are scheduled for Sprint 2 security/admin operations track.

