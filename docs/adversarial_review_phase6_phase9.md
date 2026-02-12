# Adversarial Review: Phase 6 through Phase 9

## Iteration 1 Findings

1. `high` Zo assumption controls existed as policy text but had no machine-enforced freshness gate.
2. `medium` Zo HTTP adapter lacked explicit timeout-path regression tests.
3. `medium` Release validation had no single canonical gate command.
4. `medium` No dedicated CI job executed full release gate checks for promotion.

## Iteration 1 Remediation Applied

- Added evidence registry and freshness gate:
  - `docs/ZO_ASSUMPTION_EVIDENCE.json`
  - `scripts/check-zo-assumptions.mjs`
- Added Zo HTTP timeout/auth regression test:
  - `tests/zo.http.proxy.errors.test.ts`
- Added release gate orchestration:
  - `scripts/release-gate.mjs`
  - `package.json` scripts (`release:gate`, `verify:all`, `assumptions:check`)
- Added CI release readiness workflow:
  - `.github/workflows/release-readiness.yml`

## Iteration 1 Validation

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run assumptions:check`
- `npm run release:gate`

Result:
- No open `high` findings for local repository scope.
- Remaining risks are deployment-environment validation items, captured in phase 9 handoff.

Final State: `pass`

## Iteration 2 Findings (Full-Scope Follow-Up)

1. `high` Unknown MCP tool names could be under-classified as `read`.
2. `high` Zo HTTP asks were always classified as `read`, weakening fail-closed semantics.
3. `medium` Actor signatures were replayable within skew window due nonce absence.
4. `medium` Zo HTTP request identity could produce false replay conflicts.
5. `low` Assumption checker accepted future-dated evidence.

## Iteration 2 Remediation Applied

- Added explicit fail-closed action classification contracts:
  - `@mythologiq/qore-contracts/src/schemas/ActionClassification.ts`
  - wired in `zo/mcp-proxy/translator.ts` and `zo/http-proxy/translator.ts`
- Added actor nonce into signature payload and ingress replay cache:
  - `zo/security/actor-proof.ts`
  - `zo/mcp-proxy/server.ts`
  - `zo/http-proxy/server.ts`
- Expanded Zo HTTP request identity derivation to include model/session/context hash.
- Added explicit HTTP `REPLAY_CONFLICT` response handling in Zo HTTP proxy.
- Hardened assumption checker for future-dated evidence.

## Iteration 2 Validation

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run assumptions:check`
- `npm run release:gate`

Result:
- No open `high` or `medium` findings for implemented local scope after remediation.
- Residual risk remains deployment-environment-specific, not repository logic.

Final State (Iteration 2): `pass`

## Iteration 3 Findings (Second Iterative Review)

1. `high` Fail-closed classifier can regress to `read` via substring collisions.
2. `medium` Nonce replay cache is process-local and does not prevent cross-instance replay.
3. `medium` Nonce replay cache is unbounded in-memory within TTL window and can be abused for memory pressure.

## Iteration 3 Evidence

- Substring collision risk in action classifier:
  - `@mythologiq/qore-contracts/src/schemas/ActionClassification.ts`
  - token matching uses `input.includes(...)` and read tokens include broad fragments (`get`, `list`), allowing accidental read classification.
- Process-local replay cache:
  - `zo/mcp-proxy/server.ts`
  - `zo/http-proxy/server.ts`
  - both use in-memory `Map` replay nonce cache only.
- Unbounded replay cache growth:
  - `zo/mcp-proxy/server.ts`
  - `zo/http-proxy/server.ts`
  - cache has TTL pruning but no explicit size cap or eviction budget.

Current State (Iteration 3): `in_progress`

## Iteration 3 Remediation Applied

- Replaced substring-matching classification with boundary-safe token classification:
  - `@mythologiq/qore-contracts/src/schemas/ActionClassification.ts`
- Added replay store abstraction with bounded memory and shared SQLite strategies:
  - `zo/security/replay-store.ts`
- Wired shared-capable replay protection into MCP and Zo HTTP proxies:
  - `zo/mcp-proxy/server.ts`
  - `zo/http-proxy/server.ts`
- Added distributed replay regression and classifier hardening tests:
  - `tests/zo.http.proxy.replay.distributed.test.ts`
  - `tests/zo.security.replay-store.test.ts`
  - `tests/action.classification.test.ts`

## Iteration 3 Validation

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run assumptions:check`
- `npm run release:gate`

Result:
- Iteration 3 `high` and `medium` findings remediated for repository scope.

Final State (Iteration 3): `pass`

## Iteration 4 Findings (Additional Adversarial Pass)

1. `medium` Default replay protection strategy remains memory-based and replay-resistant guarantees degrade under nonce-flood eviction.

## Iteration 4 Evidence

- Default strategy path:
  - `zo/mcp-proxy/server.ts`
  - `zo/http-proxy/server.ts`
  - both default to memory strategy when replay strategy is unspecified.
- Eviction behavior:
  - `zo/security/replay-store.ts`
  - memory store evicts oldest entries when capacity is reached.
- Demonstrated replay-after-eviction behavior:
  - `tests/zo.security.replay-store.test.ts`
  - test intentionally confirms replay of an evicted nonce can succeed.

## Iteration 4 Remediation Direction

- Use SQLite replay strategy as production default for proxy servers.
- Keep memory strategy only as explicit fallback for single-process development mode.

Current State (Iteration 4): `in_progress`

## Iteration 4 Remediation Applied

- Set replay protection strategy default to SQLite for both proxy surfaces:
  - `zo/mcp-proxy/server.ts`
  - `zo/http-proxy/server.ts`
- Added automatic replay DB directory creation in SQLite replay store:
  - `zo/security/replay-store.ts`
- Added robustness for timeout mapping on abort errors from upstream fetch:
  - `zo/http-proxy/forwarder.ts`
- Stabilized MCP tests by explicitly pinning memory replay strategy in test fixtures:
  - `tests/zo.mcp.proxy.integration.test.ts`
  - `tests/zo.mcp.proxy.hardening.test.ts`
  - `tests/zo.mcp.metrics.sink.test.ts`

## Iteration 4 Validation

- `npm run typecheck`
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run assumptions:check`
- `npm run release:gate`

Result:
- Iteration 4 medium finding remediated for repository scope.

Final State (Iteration 4): `pass`
