# Phase 4 Substantiation

## Implemented Controls

1. Signed actor proof enforcement for MCP ingress
- `zo/security/actor-proof.ts`
- `zo/mcp-proxy/server.ts`
- `zo/security/actor-keyring.ts` (key IDs + rotation-ready keyring)
- `zo/security/mtls-actor-binding.ts` (mTLS certificate-bound actor identity checks)

2. Automated actor key rotation tooling
- `zo/security/actor-key-rotation.ts`
- `scripts/rotate-actor-keys.mjs` (`npm run keys:rotate`)

3. Replay-safe MCP request ID derivation
- `zo/mcp-proxy/translator.ts`

4. Upstream response integrity checks
- `zo/mcp-proxy/forwarder.ts`
- Handles non-2xx (`UpstreamHttpError`) and malformed JSON-RPC (`UpstreamProtocolError`)

5. Error-correlation hardening
- Proxy error IDs derived from parsed request ID, not attacker-supplied headers
- `zo/mcp-proxy/server.ts`

6. Traffic governance and observability hardening
- `zo/mcp-proxy/rate-limit.ts` (memory + SQLite shared limiter strategies)
- `zo/mcp-proxy/metrics.ts` (`/metrics` counters + sink failure telemetry)
- `zo/mcp-proxy/metrics-sink.ts` (external HTTP sink publisher)
- `/metrics` endpoint and sink publishing loop in `zo/mcp-proxy/server.ts`

7. Phase 3 operability completion artifacts
- Runtime start entrypoint: `runtime/service/start.ts`
- Fallback watcher start entrypoint: `zo/fallback/start-watcher.ts`
- CLI wrapper: `zo/fallback/cli/failsafe-run.ts`
- Systemd templates: `deploy/systemd/*.service`

## Validation Evidence

- `npm run typecheck`: pass
- `npm test`: pass
- `npm run lint`: pass
- `npm run build`: pass

Key tests:
- `tests/zo.mcp.proxy.integration.test.ts`
- `tests/zo.mcp.proxy.hardening.test.ts`
- `tests/zo.mcp.forwarder.test.ts`
- `tests/zo.mcp.rate-limit.sqlite.test.ts`
- `tests/zo.mcp.metrics.sink.test.ts`
- `tests/zo.security.actor-key-rotation.test.ts`
- `tests/zo.security.mtls.binding.test.ts`
- `tests/zo.fallback.identity.test.ts`
- `tests/zo.fallback.pipeline.test.ts`
- `tests/zo.fallback.wrapper.test.ts`

## Adversarial Review Outcome

- Iterative review state: `pass`
- Source: `docs/adversarial_review_phase4_iterations.md`
- Phase 4 completion status: `implemented`
