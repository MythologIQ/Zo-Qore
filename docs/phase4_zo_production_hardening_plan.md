# Phase 4 Plan: Zo Production Hardening and Operability

## Objective

Harden the Zo-native governance path for production reliability, identity integrity, and operational safety.

Status: `implemented`

## Scope

In scope:
- Signed actor identity proof enforcement on MCP proxy ingress
- Stronger request correlation and replay safety
- Upstream response validation and rejection handling
- Operational entrypoints for runtime service and fallback watcher
- Adversarially validated fail-closed behavior for governance controls

Out of scope:
- Zo platform internals

## Implementation Slices

### Slice 1: Identity and Request Integrity

- Signed actor proof verification (`x-actor-id`, `x-actor-ts`, `x-actor-sig`)
- Key-rotation-aware actor key IDs (`x-actor-kid`)
- Replay-safe request-id derivation including params fingerprint
- Strict unauthorized rejection path

Status: `implemented`

### Slice 2: Upstream Contract and Failure Safety

- Validate upstream MCP response shape
- Map upstream non-2xx to stable governance error
- Prevent spoofed JSON-RPC error correlation IDs

Status: `implemented`

### Slice 3: Operability Entry Points

- Runtime service start entrypoint
- Fallback watcher start entrypoint
- Systemd templates for service deployment

Status: `implemented`

### Slice 4: Traffic Governance and Observability

- In-memory rate limiting for proxy ingress
- SQLite-backed shared rate limiting mode for multi-instance deployments
- Metrics export endpoint for governance counters
- External HTTP metrics sink publishing
- Optional TLS/mTLS server mode for deployment hardening
- mTLS client-certificate actor identity binding enforcement

Status: `implemented`

## Acceptance Criteria

1. No unsigned actor context can execute MCP tool forwarding.
2. Upstream malformed/unhealthy responses are rejected deterministically.
3. Replay and ID spoofing vectors are mitigated by design and tests.
4. Service startup flows for runtime and fallback watcher are present and documented.
5. Adversarial review reaches `pass` state for high-severity findings.
6. Key rotation tooling, shared rate limiting, and external metrics export are implemented and tested.

## Zo Assumption Guardrail

Phase 4 hardening does not change architecture boundaries. Zo-native enforcement is implemented behind explicit interfaces and transport wrappers, while core policy/risk/ledger logic remains Zo-agnostic per `docs/ZO_ASSUMPTIONS_AND_GATES.md`.
