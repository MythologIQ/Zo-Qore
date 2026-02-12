# ZoQore System Plan

## Purpose

Define ZoQore as the system-level product layer built on FailSafe-Qore runtime roots.

Status:
- Product-system planning baseline: `implemented`
- Runtime-root continuity (`FailSafe-Qore`): `locked`
- Functional-first execution posture: `locked`

## Boundary Model

1. Runtime roots remain in this repository under existing core domains:
- `policy/`
- `risk/`
- `ledger/`
- `runtime/`
- `zo/`

2. Product layer (`ZoQore`) is established as system behavior and operational surfaces:
- Control plane (`qorectl`, setup/install flows)
- Operations console and admin controls
- Release and migration lifecycle

3. Branding is secondary for this execution track.
- Functional correctness, hardening, and operability remain priority.

## System Objectives

1. Deliver one-command, production-safe Zo installation and operation. `in_progress`
2. Provide control-plane commands for install, doctor, and security operations. `implemented` 
3. Enforce hardened access controls for public UI surfaces. `implemented`
4. Establish adversarial iteration loop with explicit pass/fail state. `in_progress`
5. Preserve core governance behavior and runtime contract stability. `locked`

## Phase Plan

### Phase A: Planning and Gates

Deliverables:
- System plan and acceptance gates
- Initial Sprint-1 implementation scope and checkpoints

Status: `implemented`

### Phase B: Control Plane Baseline

Deliverables:
- `qorectl doctor` for runtime/UI/service posture checks
- `qorectl revoke-sessions` for security response operations
- installer integration guidance

Status: `implemented`

### Phase C: Security and Admin Operations

Deliverables:
- session/device trust management controls
- MFA recovery and re-enrollment path
- hardened admin endpoint coverage

Status: `implemented`

### Phase D: Operational Resilience

Deliverables:
- backup/restore lifecycle commands
- rollback-safe upgrade path
- migration hooks and release integrity checks

Status: `planned`

### Phase E: Substantiation

Deliverables:
- release-grade substantiation artifact
- adversarial loop pass-state evidence
- handoff-ready operator runbook

Status: `planned`

## Sprint 2 Scope (Current)

1. Extend control-plane operations for session and device inventory. `implemented`
2. Add MFA recovery reset flow with explicit confirmation semantics. `implemented`
3. Enforce public-bind hardening defaults for standalone UI script path. `implemented`
4. Validate via typecheck, targeted tests, lint, and build. `implemented`
5. Record adversarial findings against Sprint 2 surfaces. `in_progress`

## Out of Scope (Sprint 2)

- visual rebrand sweep
- multi-node distributed session store
- backup/restore implementation
- upgrade migration orchestration

## Success Criteria (Sprint 2)

1. `qorectl` supports doctor, sessions, devices, revoke, and MFA recovery operations.
2. Admin API path is test-covered for token enforcement and operational routes.
3. Standalone script blocks unsafe public launch when required auth variables are missing.
4. Typecheck/tests/lint/build pass after changes.
