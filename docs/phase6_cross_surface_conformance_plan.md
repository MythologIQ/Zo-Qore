# Phase 6 Plan: Cross-Surface Governance Conformance

## Objective

Prove governance behavior is consistent across Zo MCP, Zo HTTP, and SSH fallback adapter surfaces without moving policy logic out of the Qore core.

Status: `implemented`

## Scope

In scope:
- Cross-surface conformance checks for allow/deny and fail-closed behavior.
- Zo assumption evidence freshness validation tooling.
- Adapter-level parity documentation and claim-map updates.

Out of scope:
- Zo platform internals.
- Any adapter-specific policy forks.

## Deliverables

1. Zo assumption evidence registry and freshness checker.
2. Expanded Zo HTTP error-path tests (unauthorized and upstream timeout).
3. Documentation updates showing adapter parity and guardrail coverage.

## Evidence

- `docs/ZO_ASSUMPTION_EVIDENCE.json`
- `scripts/check-zo-assumptions.mjs`
- `tests/zo.http.proxy.integration.test.ts`
- `tests/zo.http.proxy.errors.test.ts`

## Acceptance Criteria

1. Assumption evidence check fails stale or incomplete records.
2. Zo HTTP proxy behavior is deterministic for auth/timeout/deny paths.
3. Architecture docs preserve core-runtime neutrality and no adapter policy drift.
