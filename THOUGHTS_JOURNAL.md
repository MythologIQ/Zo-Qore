# Zo-Qore Thoughts Journal

A place to capture design thinking, architectural insights, and the reasoning behind decisions.

---

## Builder Console — UX Direction

The Comms page exposes too much. Prompt enhancement should be invisible. Skill/Persona/Model toggles should be collapsed by default, available for power users. The result should feel like a traditional chat — clean, focused — with the machinery hidden underneath.

Brainstorm is really a capture mechanism. Voice → void visual → artifact → mind map. The spoken words echo on screen, get pulled into the void, and become a captured artifact that can later be processed into structured thought.

Mind maps need a structured view option — not just spatial. Sometimes you want to drag branches, not float nodes.

Project folder selection needs depth. Full hierarchy browser with inline folder creation. Don't make users leave the console to organize.

---

## Governance Architecture

Prompt-based governance is soft. It relies on the LLM choosing to comply. Kernel-level governance is hard — the LLM cannot bypass it.

The distinction matters:
- Privacy, security, file boundaries → Kernel
- Style, tone, methodology → Prompt
- Persona core traits → Hybrid (kernel enforces the rule, prompt shapes the expression)

---

## Two Sides of Zo

Builder and Victor are two faces of the same system. Shared governance (Qore), shared infrastructure, but specialized workflows.

Builder = Construction mode. Project tracking, code, architecture, testing.
Victor = Management mode. Email, calendar, tasks, life orchestration.

Both need chat. Both need governance. But the application is different.

Builder chat = working through code problems, planning, debugging.
Victor chat = working through life problems, scheduling, decisions.

The mobile app will reflect this split — one app, two modes.

---

## QoreLogic Tribunal — Kernel Hooks

The Governor/Judge/Specialist personas have rules that should be enforced at the kernel level:

- Razor (40-line functions, 250-line files, 3-indent max) — not suggestions
- Security stub detection (TODO/FIXME in security paths) — hard blocks
- Merkle chain validation — not optional
- Build path verification (ghost prevention) — prevent orphaned code

These are now in `qorelogic-gates.ts`. The scripts (`ql-check`, `ql-bootstrap`, `ql-seal`) make them callable.

---

## Organizational Enforcement — Project Structure

Standard file structure matters. Protection from impacting other systems.

Projects should exist inside their own Project Sandbox, within an overarching Projects Sandbox that contains all projects.

We need to differentiate between:
- **In Motion** — Active development
- **Completed** — Finished, archived
- **Continuous** — Never really "done" — Zo-Qore, Victor

Some projects are universal workspaces. They won't stop being developed. The structure should account for that.

```
Projects/
├── continuous/     # Always in motion
│   ├── Zo-Qore/
│   └── Victor/
├── active/         # In motion, finite scope
│   └── [project-name]/
└── completed/      # Archived
    └── [project-name]/
```

Each sandboxed. Each with its own DNA (CONCEPT.md, ARCHITECTURE_PLAN.md, META_LEDGER.md). No project touches another project's internals without explicit intent.

---


## Game-System Framework

Two tabletop RPG systems under one container. Different rulesets, shared infrastructure.

**Celestara**
- Campaign setting for D20/D*Continue capturing thoughts here.D
- Technically rules-agnostic — no core rulebook, focuses on lunar magic system
- Early development — needs editable "book" structure for content/organization
- Content waiting to be imported into database structure

**Shadowdark**
- Independent game system with its own core rules
- Needs accurate rules documentation + strict adherence
- Website content: full rules resource, character generator, sheets, game management, inventory

**Shared Systems** (ruleset-agnostic, swappable):
- Character generation
- Character sheets
- Maps
- Game management tools
- Inventory management

**Key insight:** Character gen, sheets, maps all follow similar systems with format variations based on ruleset. Build one engine that swaps rules.

**Immediate priorities:**
- Shadowdark: Document ruleset accurately, build systems with close attention to rule adherence
- Celestara: Establish editable book structure, import content into database

---

*Continue capturing thoughts here. Use META_LEDGER.md for formal governance entries.*


## Game-System Framework

Two tabletop RPG systems under one container. Different rulesets, shared infrastructure.

**Celestara**
- Campaign setting for D20/D&D
- Technically rules-agnostic — no core rulebook, focuses on lunar magic system
- Early development — needs editable "book" structure for content/organization
- Content waiting to be imported into database structure

**Shadowdark**
- Independent game system with its own core rules
- Needs accurate rules documentation + strict adherence
- Website content: full rules resource, character generator, sheets, game management, inventory

**Shared Systems** (ruleset-agnostic, swappable):
- Character generation
- Character sheets
- Maps
- Game management tools
- Inventory management

**Key insight:** Character gen, sheets, maps all follow similar systems with format variations based on ruleset. Build one engine that swaps rules.

**Immediate priorities:**
- Shadowdark: Document ruleset accurately, build systems with close attention to rule adherence
- Celestara: Establish editable book structure, import content into database

---

*Continue capturing thoughts here. Use META_LEDGER.md for formal governance entries.*
