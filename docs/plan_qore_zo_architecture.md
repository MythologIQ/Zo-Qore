# FailSafe-Qore Zo Native Architecture

## Purpose

Define the Zo-native design and implementation path for FailSafe-Qore.

Status:
- Zo-native architecture target: `implemented` for repository-local scope
- Zo-native implementation layers (MCP proxy, SSH fallback): `implemented`
- IDE-independent core runtime: `implemented`

This document is the primary architecture source for how Qore will run on Zo Linux and govern Zo automation surfaces.
Assumption controls are defined in `docs/ZO_ASSUMPTIONS_AND_GATES.md` and are required for Zo-specific development.

## Architectural Objectives

1. Qore runs as a Zo-native service. `in_progress`
2. Core governance logic has zero IDE runtime dependency. `implemented`
3. Zo MCP interception is the primary governance surface. `implemented`
4. Zo SSH fallback controls provide defense-in-depth. `implemented`
5. Design remains composable for future adapters without changing core policy behavior. `in_progress`

## Zo Integration Surfaces

### Zo HTTP API

- Endpoint: `https://api.zo.computer`
- Primary entry: `POST /zo/ask`
- Governance goal: optional forward proxy that validates outbound calls before forwarding. `implemented`

### Zo MCP Server

- Endpoint: `https://api.zo.computer/mcp`
- Transport: standard HTTP, compatible with `mcp-remote` bridges
- Governance goal: all MCP tool calls are preflighted through Qore policy and risk gates. `implemented`

### Zo SSH Computer Mode

- Environment: Linux over SSH with persistent services
- Governance goal: run Qore as an always-on service and enforce a command-wrapper fallback path. `implemented`

## Runtime Components

### Qore Runtime Core

Responsibilities:
- Policy evaluation
- Risk scoring
- Decision issuance
- Ledger append and verification
- Health/reporting APIs

Status: `implemented` baseline in this repository; service-hosting layer is `planned`.

### Zo MCP Proxy

Responsibilities:
- Accept MCP requests from clients
- Translate requests into Qore decision contracts
- Block/allow tool execution based on policy + risk
- Persist decision evidence in ledger

Status: `implemented`.

### Zo SSH Fallback

Responsibilities:
- `failsafe-run` wrapper for high-risk command mediation
- Optional filesystem/process watch fallback
- Audit logging for actions bypassing MCP path

Status: `implemented`.

## Security Model

### Identity

- Map each MCP client and SSH session to `actor_id`
- Attach context evidence to every decision and ledger event

Status: `implemented`.

### Fail Modes

- `fail_closed` for destructive operations
- `fail_open` only for explicitly low-risk reads

Status: `planned`.

### Ledger Integrity

- Append-only entries
- Hash-chained events
- Deterministic verification path

Status: `implemented` baseline; Zo service hardening is `planned`.

## Phased Implementation

### Phase 1: Runtime Extraction Hardening

Deliverables:
- Stable decision contracts
- Policy/risk/ledger runtime baseline
- Local APIs with tests

Status: `implemented`.
Progress snapshot:
- Decision request/response contracts in `@mythologiq/qore-contracts` (`implemented`)
- Runtime evaluation service in `runtime/service/QoreRuntimeService.ts` (`implemented`)
- Local API server endpoints (`/health`, `/policy/version`, `/evaluate`) in `runtime/service/LocalApiServer.ts` (`implemented`)

### Phase 2: Zo MCP Governance Path

Deliverables:
- HTTP MCP proxy
- Enforcement gate and policy preflight
- Tool call result logging

Status: `implemented`.
Progress snapshot:
- MCP translator implemented in `zo/mcp-proxy/translator.ts` (`implemented`)
- Upstream forwarder with timeout/retry gating in `zo/mcp-proxy/forwarder.ts` (`implemented`)
- Zo MCP governance proxy server in `zo/mcp-proxy/server.ts` (`implemented`)
- Integration tests in `tests/zo.mcp.proxy.integration.test.ts` (`implemented`)

### Phase 3: Zo SSH Fallback Controls

Deliverables:
- `failsafe-run` command wrapper
- Service install unit for Zo Linux
- Minimal fallback change detection

Status: `implemented`.
Progress snapshot:
- Fallback wrapper setup in `zo/fallback/failsafe-run.ts` (`implemented`)
- Fallback watcher scaffold in `zo/fallback/watcher.ts` (`implemented`)
- Phase 3 setup runbook in `docs/phase3_zo_fallback_setup.md` (`implemented`)
- SSH actor identity mapping in `zo/fallback/identity.ts` (`implemented`)
- Fallback pipeline and service entrypoints (`implemented`)

### Phase 4: Zo Production Hardening and Operability

Deliverables:
- Signed actor proof enforcement
- Upstream response validation and rejection handling
- Request integrity hardening and replay safety
- Operational start entrypoints and adversarial pass state

Status: `implemented`.
Progress snapshot:
- Phase 4 plan in `docs/phase4_zo_production_hardening_plan.md` (`implemented`)
- Iterative adversarial review in `docs/adversarial_review_phase4_iterations.md` (`implemented`)
- Core hardening slices 1-4 (`implemented`)
- Substantiation evidence in `docs/phase4_substantiation.md` (`implemented`)

### Phase 5: Zo HTTP API Governance and Release Assurance

Deliverables:
- Zo HTTP `/zo/ask` governance proxy path
- Signed actor enforcement on Zo HTTP ingress
- Stable upstream failure semantics
- Adversarial review and release substantiation updates

Status: `implemented`.
Progress snapshot:
- Phase 5 plan in `docs/phase5_zo_http_api_release_plan.md` (`implemented`)
- Phase 5 adversarial iteration log in `docs/adversarial_review_phase5_iterations.md` (`implemented`)
- Phase 5 substantiation in `docs/phase5_substantiation.md` (`implemented`)
- Zo HTTP proxy baseline in `zo/http-proxy/server.ts` (`implemented`)
- Zo HTTP integration tests in `tests/zo.http.proxy.integration.test.ts` (`implemented`)
- Zo direct model policy and prompt transparency events in `zo/http-proxy/server.ts` (`implemented`)

### Phase 6: Cross-Surface Governance Conformance

Deliverables:
- Assumption evidence freshness gating
- Cross-surface deterministic failure-path validation
- Documentation parity updates for adapter governance behavior

Status: `implemented`.
Progress snapshot:
- Phase 6 plan in `docs/phase6_cross_surface_conformance_plan.md` (`implemented`)
- Assumption evidence registry in `docs/ZO_ASSUMPTION_EVIDENCE.json` (`implemented`)
- Assumption freshness checker in `scripts/check-zo-assumptions.mjs` (`implemented`)
- Zo HTTP error-path tests in `tests/zo.http.proxy.errors.test.ts` (`implemented`)

### Phase 7: Operational Resilience and Release Gates

Deliverables:
- Automated release gate command
- CI release-readiness execution path
- Fast-fail validation chain for quality/security baselines

Status: `implemented`.
Progress snapshot:
- Phase 7 plan in `docs/phase7_operational_resilience_plan.md` (`implemented`)
- Release gate script in `scripts/release-gate.mjs` (`implemented`)
- Release scripts in `package.json` (`implemented`)
- CI release-readiness workflow in `.github/workflows/release-readiness.yml` (`implemented`)

### Phase 8: Release Substantiation and Audit Bundle

Deliverables:
- Consolidated evidence and status claims
- Adversarial iteration coverage for final phases
- Linked substantiation set for release review

Status: `implemented`.
Progress snapshot:
- Phase 8 plan in `docs/phase8_release_substantiation_plan.md` (`implemented`)
- Updated status map in `docs/DOCUMENTATION_STATUS.md` (`implemented`)
- Adversarial record in `docs/adversarial_review_phase6_phase9.md` (`implemented`)

### Phase 9: Handoff and Governance Closeout

Deliverables:
- Final handoff artifact set with residual risks
- Repeatable release-gate commands for ongoing teams
- Phase 1-9 execution continuity in architecture docs

Status: `implemented`.
Progress snapshot:
- Phase 9 handoff in `docs/phase9_handoff_and_governance_closeout.md` (`implemented`)
- Full phase map coverage in this architecture document (`implemented`)
- Release-gate execution command (`npm run release:gate`) in place (`implemented`)

## Success Criteria

- Qore runs independently on Zo without UI dependencies. `implemented`
- Zo API/MCP/SSH surfaces are governed by Qore policy logic. `implemented`
- Policy and risk behavior remain consistent across environments. `in_progress`
- No policy logic exists outside Qore core runtime. `in_progress`

## Non-Goals

- Modifying Zo internal platform code
- Replacing Zo APIs
- Reintroducing IDE coupling into runtime core
- Overengineering fallback interception beyond explicit risk controls

## Assumption Safety

Zo-specific implementation must pass the design, implementation, and release gates in `docs/ZO_ASSUMPTIONS_AND_GATES.md`.
If a Zo behavior is not verified, it must be marked `unknown` and treated as non-blocking input until validated.
