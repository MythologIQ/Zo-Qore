# Adversarial Review: Phase 1 Implementation and Phase 2 Plan

## Scope

- Phase 1 code in current repository baseline
- Phase 2 plan in `docs/phase2_zo_mcp_plan.md`

## Findings (ordered by severity)

### 1. Local API has no authentication boundary (`high`)

Risk:
- Any local process can call `/evaluate`, causing unauthorized policy decisions or noisy ledger events.

Evidence:
- `runtime/service/LocalApiServer.ts` now enforces `x-qore-api-key` for non-health routes by default.

Mitigation:
- Add optional mandatory API key or mTLS gate before non-health endpoints.
- Default bind remains localhost, but that is not sufficient for hostile local processes.

Status:
- `implemented` in Phase 1 hardening.

### 2. Evaluate endpoint has no request size ceiling (`high`)

Risk:
- Large JSON payloads can increase memory pressure and degrade service availability.

Evidence:
- `runtime/service/LocalApiServer.ts` enforces `maxBodyBytes` and returns `PAYLOAD_TOO_LARGE`.

Mitigation:
- Enforce max body bytes and reject oversized payloads with stable error code.

Status:
- `implemented` in Phase 1 hardening.

### 3. Decision IDs are generated but replay controls are missing (`medium`)

Risk:
- Repeated requests with identical `requestId` can produce duplicate governance events and ambiguous operator interpretation.

Evidence:
- `runtime/service/QoreRuntimeService.ts` now caches by `actorId::requestId` and raises `REPLAY_CONFLICT` on mismatched payload replay.

Mitigation:
- Add replay cache keyed by `requestId` + actor window.
- Return existing decision for duplicate in TTL window.

Status:
- `implemented` in Phase 1 hardening.

### 4. Phase 2 upstream trust boundary can be spoofed without explicit actor proof (`high`)

Risk:
- If actor identity is derived from mutable headers only, attacker-controlled clients can forge privileged actor IDs.

Evidence:
- Phase 2 plan includes actor/session header mapping and requires stronger identity proof.

Mitigation:
- Require signed actor tokens or mTLS-bound identity on proxy ingress.
- Reject missing/invalid signatures in strict mode.

Status:
- `planned` in Phase 2 security controls.

### 5. Phase 2 timeout/retry policy can duplicate mutating actions (`high`)

Risk:
- Retrying non-idempotent tool calls may trigger duplicate side effects upstream.

Evidence:
- Phase 2 plan allows retry budget and explicitly constrains retries to read-only calls.

Mitigation:
- Enforce retry allowlist by tool category; retries disabled by default for mutating tools.
- Add idempotency token support where available.

Status:
- `planned`.

### 6. Fail-open behavior during ledger failures can hide critical operations (`medium`)

Risk:
- If fail-open is misapplied to mutating tools, high-risk actions may execute without auditable records.

Evidence:
- Architecture calls for configurable fail modes per surface.

Mitigation:
- Hard-code fail-closed on mutating tools and privileged operations.
- Fail-open only on explicit low-risk read-only allowlist.

Status:
- `in_progress` (mutating action default is now fail-closed escalation in runtime evaluation; ledger-failure policy hardening still pending).

## Phase 1 Security Posture Summary

- Core contracts, evaluation, and local API are `implemented`.
- Error contracts and trace IDs are `implemented`.
- Authn/authz and payload size guardrails are `implemented`.
- Replay conflict protection is `implemented`.
- Remaining gap: ledger-failure fail-mode enforcement for mutating operations is `planned`.

## Phase 2 Plan Readiness Summary

- Implementation decomposition is decision-complete for first execution slice.
- Main residual risks are identity proof, idempotency, and strict fail-mode boundaries.
- These risks are addressable with explicit guardrails before production rollout.
