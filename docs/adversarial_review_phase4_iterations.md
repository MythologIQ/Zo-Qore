# Adversarial Review: Phase 4 Iterations

## Iteration 1 Findings

1. `high` Actor spoof risk via header-only identity in MCP proxy.
2. `high` Replay-key collisions causing request conflict denial.
3. `medium` Error correlation ID spoof via request headers.
4. `medium` Upstream response not schema-validated.
5. `medium` Fallback request ID collision risk via timestamp-based IDs.

## Iteration 1 Remediation Applied

- Actor proof verification added in `zo/security/actor-proof.ts` and enforced in `zo/mcp-proxy/server.ts`.
- Replay-key derivation now includes params hash in `zo/mcp-proxy/translator.ts`.
- Error response ID now derived from parsed request ID, not headers (`zo/mcp-proxy/server.ts`).
- Upstream MCP responses validated and non-2xx handled in `zo/mcp-proxy/forwarder.ts`.
- Fallback request IDs moved to UUID in `zo/fallback/failsafe-run.ts`.

## Iteration 2 Findings

1. `medium` Actor key rotation support missing (single shared secret only).
2. `medium` Proxy lacked ingress abuse throttling.
3. `medium` Governance metrics unavailable for operational detection.
4. `low` TLS/mTLS deployment mode not available in server implementation.

## Iteration 2 Remediation Applied

- Actor keyring with key IDs added in `zo/security/actor-keyring.ts` and enforced by proxy.
- Rate limiting added in `zo/mcp-proxy/rate-limit.ts` and wired in proxy server.
- Metrics counters and `/metrics` endpoint added via `zo/mcp-proxy/metrics.ts` and proxy server.
- Optional TLS/mTLS server mode added in `zo/mcp-proxy/server.ts`.
- Hardening test coverage added in `tests/zo.mcp.proxy.hardening.test.ts`.

## Iteration 2 Validation

Evidence:
- Proxy integration tests: `tests/zo.mcp.proxy.integration.test.ts`
- Translator tests: `tests/zo.mcp.translator.test.ts`
- Fallback tests: `tests/zo.fallback.wrapper.test.ts`, `tests/zo.fallback.identity.test.ts`, `tests/zo.fallback.pipeline.test.ts`
- Full suite validation via `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`

Result:
- No open `high` severity findings in implemented slices.
- Backlog accepted for closure into final hardening implementation pass.

## Iteration 3 Findings

1. `medium` Single-process rate limiting can be bypassed by multi-instance fanout.
2. `medium` Rotation-ready key IDs lacked operational rollover automation.
3. `medium` Metrics visibility was local-only (`/metrics` scrape) with no external sink support.
4. `medium` mTLS mode did not bind actor identity to certificate subject/SAN.

## Iteration 3 Remediation Applied

- Added shared SQLite limiter strategy in `zo/mcp-proxy/rate-limit.ts`.
- Added actor key rotation helpers and CLI automation:
  - `zo/security/actor-key-rotation.ts`
  - `scripts/rotate-actor-keys.mjs`
- Added external HTTP metrics sink publishing:
  - `zo/mcp-proxy/metrics-sink.ts`
  - sink wiring and failure counters in `zo/mcp-proxy/server.ts` and `zo/mcp-proxy/metrics.ts`
- Added mTLS actor binding logic using certificate CN/URI SAN matching:
  - `zo/security/mtls-actor-binding.ts`
  - enforcement in `zo/mcp-proxy/server.ts`

## Iteration 3 Validation

Evidence:
- `tests/zo.mcp.rate-limit.sqlite.test.ts`
- `tests/zo.mcp.metrics.sink.test.ts`
- `tests/zo.security.actor-key-rotation.test.ts`
- `tests/zo.security.mtls.binding.test.ts`
- Full suite validation via `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`

Result:
- No open `high` or `medium` findings in the defined Phase 4 scope.
- Residual risk profile is operational (deployment policy, cert issuance lifecycle), not code-gap.

Final State: `pass`
