# Phase 3 Setup: Zo SSH Fallback Controls

## Objective

Prepare implementation-ready scaffolding for OS-level fallback governance when MCP interception is unavailable or bypassed.

Status: `implemented`

## Implemented Setup Components

1. Fallback command contract types
- `zo/fallback/types.ts`

2. Fallback command governance wrapper
- `zo/fallback/failsafe-run.ts`
- Uses `QoreRuntimeService.evaluate` with `action: execute`
- Blocks non-`ALLOW` decisions by default

3. Minimal filesystem watcher scaffold
- `zo/fallback/watcher.ts`
- Emits normalized fallback watcher events for audit pipelines

4. Baseline safety test
- `tests/zo.fallback.wrapper.test.ts`
- Verifies high-risk command blocking path

5. SSH actor identity mapping
- `zo/fallback/identity.ts`
- Signed actor context verification for fallback CLI/session flows

6. Watcher governance pipeline
- `zo/fallback/pipeline.ts`
- Evaluates fallback events and writes pass/fail evidence to ledger

7. Executable entrypoints and service templates
- `zo/fallback/cli/failsafe-run.ts`
- `zo/fallback/start-watcher.ts`
- `runtime/service/start.ts`
- `deploy/systemd/failsafe-qore.service`
- `deploy/systemd/failsafe-fallback-watcher.service`

## Substantiation

- Fallback wrapper test coverage: `tests/zo.fallback.wrapper.test.ts`
- SSH identity verification test coverage: `tests/zo.fallback.identity.test.ts`
- Pipeline fail-closed behavior test coverage: `tests/zo.fallback.pipeline.test.ts`

## Acceptance Criteria for Full Phase 3

- SSH command wrapper enforces governance decisions before execution.
- Unmediated filesystem/process changes are detected and logged.
- Fallback event streams are auditable and linked to actor identity.
- Fail-closed is default for privileged and mutating operations.
