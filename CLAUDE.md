# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Zo-Qore is MythologIQ's Zo-native governance runtime. It provides policy evaluation, risk scoring, decision issuance, and ledger management for AI-assisted development environments. The core governance logic is IDE-independent, with adapter layers for Zo MCP proxy, Zo HTTP proxy, and SSH fallback controls.

## Common Commands

```bash
# Development
npm ci                    # Install dependencies
npm run build             # Clean and compile TypeScript
npm run typecheck         # Type-check without emitting
npm run lint              # Run ESLint
npm test                  # Run all tests with Vitest
npm run test:watch        # Run tests in watch mode

# Single test file
npx vitest run tests/policy.engine.test.ts

# Full validation (typecheck + lint + test + build + assumptions check)
npm run verify:all
npm run release:gate      # Release readiness check

# Local runtime (requires build first)
$env:QORE_API_KEY="your-key"
node dist/runtime/service/start.js    # Runtime API on port 7777
node dist/zo/ui-shell/start.js        # UI on port 9380

# One-click local stack (runtime + UI)
npm run zo:one-click
npm run zo:stop
```

## Architecture

### Core Layers (Adapter-Agnostic)

- **policy/engine/PolicyEngine.ts** - Policy evaluation against definitions in `policy/definitions/`
- **risk/engine/EvaluationRouter.ts** - Risk scoring with novelty detection and cache instrumentation
- **ledger/engine/LedgerManager.ts** - Append-only hash-chained ledger for audit trail
- **runtime/service/QoreRuntimeService.ts** - Orchestrates policy, risk, and ledger; exposes `evaluate()`
- **runtime/service/LocalApiServer.ts** - HTTP API (`/health`, `/policy/version`, `/evaluate`)

### Zo Adapters (in `zo/`)

- **zo/mcp-proxy/** - MCP governance proxy that preflights tool calls through Qore policy
- **zo/http-proxy/** - HTTP governance proxy for `/zo/ask` endpoint
- **zo/fallback/** - SSH fallback wrapper (`failsafe-run`) and watcher pipeline
- **zo/ui-shell/** - Standalone UI server with MFA support
- **zo/security/** - Actor proof signing, replay protection (SQLite), key rotation

### Decision Flow

1. Client sends request to Zo MCP/HTTP proxy or calls runtime API directly
2. Translator converts request to `DecisionRequest` contract
3. `QoreRuntimeService.evaluate()` runs policy + risk gates
4. `DecisionResponse` issued (allow/block/warn)
5. Decision logged to ledger with hash-chain integrity
6. Response forwarded to upstream (if allowed)

### Shared Contracts

Schemas and interfaces live in external package `@mythologiq/qore-contracts` (see `package.json`). Key types: `DecisionRequest`, `DecisionResponse`, `QoreConfig`.

## Environment Variables

**Runtime API:**
- `QORE_API_KEY` - Required API key for auth
- `QORE_API_HOST` / `QORE_API_PORT` - Defaults `127.0.0.1:7777`
- `QORE_API_PUBLIC_HEALTH` - Set `true` for unauthenticated `/health`

**UI Shell:**
- `QORE_UI_HOST` / `QORE_UI_PORT` - Defaults `127.0.0.1:9380`
- `QORE_RUNTIME_BASE_URL` - Runtime API URL
- `QORE_UI_BASIC_AUTH_USER` / `QORE_UI_BASIC_AUTH_PASS` - Basic auth credentials
- `QORE_UI_TOTP_SECRET` - MFA secret (generate with `npm run ui:mfa:secret`)
- `QORE_UI_ADMIN_TOKEN` - Required for admin API when public bind

## Testing Patterns

Tests are in `tests/` using Vitest with globals enabled. Test files follow pattern `<module>.<feature>.test.ts`:

- `qore.runtime.service.test.ts` - Core runtime tests
- `zo.mcp.proxy.integration.test.ts` - MCP proxy integration
- `zo.http.proxy.integration.test.ts` - HTTP proxy integration
- `zo.security.*.test.ts` - Security module tests

## Key Documentation

- Architecture: `docs/plan_qore_zo_architecture.md`
- Walkthrough: `docs/ZOQORE_WALKTHROUGH.md`
- Zo assumptions: `docs/ZO_ASSUMPTIONS_AND_GATES.md`
- Local IDE adapter contract: `docs/LOCAL_IDE_ADAPTER_CONTRACT.md`
