# Zo Assumptions and Development Gates

## Purpose

Prevent implementation mistakes caused by undocumented or unverified assumptions about Zo.

## Rule Set

1. No Zo behavior may be treated as fact without evidence.
2. Any Zo-specific claim must include a source link or captured artifact.
3. Unknown Zo behavior must be labeled `unknown`, not inferred.
4. Core runtime behavior must remain valid without live Zo connectivity.
5. Zo public skills usage must reference `https://github.com/zocomputer/skills` and must not be treated as a local hard dependency.

## Evidence Requirements

For each Zo-specific implementation task, record:
- Source type: official docs, API response capture, MCP trace, SSH session log
- Date captured
- Scope validated
- Open unknowns
- Registry location: `docs/ZO_ASSUMPTION_EVIDENCE.json`

## Delivery Gates

### Gate A: Design Gate

Before coding Zo integration:
- Add/update claim in `docs/DOCUMENTATION_STATUS.md`
- Mark status as `planned` or `in_progress`
- Link evidence source or mark `unknown`

### Gate B: Implementation Gate

Before merging Zo-specific code:
- Add integration tests or fixtures for expected Zo behavior
- Document fallback behavior for failure/timeout/permission error paths
- Confirm no core runtime module now hard-depends on Zo availability

### Gate C: Release Gate

Before release involving Zo integration:
- Re-validate all Zo assumptions captured more than 30 days ago
- Update `docs/plan_qore_zo_architecture.md` statuses
- Update claim map in `README.md` if capability status changed
- Run `npm run assumptions:check` and `npm run release:gate`

## Anti-Pattern List

- Hard-coding undocumented Zo payload shapes
- Treating exploratory curl output as stable contract
- Shipping behavior based on a single successful run
- Embedding Zo-specific logic into core policy/risk/ledger modules
- Copying external Zo skills into core runtime paths instead of referencing public source
