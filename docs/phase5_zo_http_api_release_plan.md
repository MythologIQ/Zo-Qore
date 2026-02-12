# Phase 5 Detailed Plan: Zo HTTP API Governance and Release Assurance

## Objective

Complete governance coverage for the Zo HTTP API path and close release-readiness controls without changing core Qore architecture boundaries.

Status: `implemented`

## Scope

In scope:
- Zo HTTP `/zo/ask` governance proxy baseline with policy preflight.
- Signed actor identity enforcement for Zo HTTP proxy ingress.
- Ledger evidence for allow/deny outcomes on Zo HTTP traffic.
- Phase 5 adversarial review, remediation tracking, and substantiation.

Out of scope:
- Zo platform internals.
- Any change to core policy/risk/ledger architecture contracts.

## Slices

### Slice 1: Zo HTTP Proxy Baseline

- Add proxy server for `/zo/ask` with API-key and signed actor proof enforcement.
- Translate ask payload into `DecisionRequest` and evaluate with runtime policy/risk.
- Forward allowed traffic to upstream Zo API and return upstream response.
- Persist audit pass/fail events to ledger.

Status: `implemented`

### Slice 2: Failure Semantics and Validation

- Stable error envelopes for unauthorized, bad JSON, validation, upstream timeout/reject.
- Request size limits and deterministic failure behavior.
- Integration tests for allow and deny paths.

Status: `implemented`

### Slice 3: Adversarial Hardening and Release Evidence

- Initial adversarial review and iterative remediation log.
- Substantiation updates in claim map and architecture docs.
- Confirm Zo assumptions remain explicitly gated and architecture-neutral.

Status: `implemented`

## Acceptance Criteria

1. Zo HTTP proxy blocks requests that policy/risk marks non-allow.
2. Unsigned or invalid actor context cannot use Zo HTTP governance path.
3. Upstream failures are surfaced with stable error contracts.
4. Phase 5 adversarial review has documented findings and remediation actions.
5. Documentation status map and architecture plan reflect Phase 5 state with status labels.

## Zo Assumption Guardrail

This phase keeps Zo-specific behavior in transport adapters only. Core policy, risk, ledger, and runtime modules remain adapter-agnostic per `docs/ZO_ASSUMPTIONS_AND_GATES.md`.
