# Zo Infrastructure Discovery Report
**Date:** 2026-02-14
**Context:** Project Tab Feature Planning

---

## 1. Storage & Data

### DuckDB Integration

**Exists:**
- **DuckDB is the primary analytics database** for Zo Datasets feature
- **Pattern:** File-based `.duckdb` databases stored in project directories (e.g., `/home/workspace/d-d-setting-celestara/data.duckdb`)
- **Schema:** Auto-generated `schema.yaml` with table/column definitions and descriptions
- **Dataset marker:** `datapackage.json` identifies directories as datasets

**Patterns:**
```
project-dataset/
├── datapackage.json          # Dataset metadata
├── data.duckdb             # Main database
├── schema.yaml             # Auto-generated schema
├── source/                # Raw source files
│   └── extracted/         # Converted artifacts
├── ingest/
│   └── ingest.py          # Transformation script
├── README.md              # Context & example queries
└── PROCESS.md             # Ingestion checklist
```

**Ingest Pattern** (from `d-d-setting-celestara/ingest/ingest.py`):
```python
DB_PATH = Path(__file__).parent.parent / "data.duckdb"
con = duckdb.connect(str(DB_PATH))
# CREATE TABLE with proper schema
# COMMENT ON TABLE for documentation
# INSERT data from source files
```

**Query Patterns:**
```bash
duckdb project/data.duckdb -c "SHOW TABLES"
duckdb project/data.duckdb -c "SELECT * FROM table_name LIMIT 5"
duckdb project/data.duckdb -c "DESCRIBE table_name"
```

**Scope:** Per-dataset (per-project directory), not global

**Gaps:**
- No global cross-dataset query interface
- No schema versioning/migration tooling
- No built-in relationship/foreign key conventions

**Leverage:**
- Use DuckDB as the Project Tab's backend storage
- Follow dataset pattern: `datapackage.json` + `data.duckdb` + `schema.yaml`
- Ingest scripts for transforming captured thoughts/notes into structured data
- Query via `duckdb` CLI or Python bindings

---

### Persistence Patterns

**Exists:**
- **AGENTS.md files** serve as long-term memory/instruction system in workspace directories
- **Conversation workspaces:** `/home/.z/workspaces/con_<id>/` for scratch files
- **File-based state:** Most persistence is file-based (Markdown, JSON, DuckDB)
- **Upload directories:** `/home/workspace/uploads/tmp/` for temporary files
- **Trash system:** `/home/workspace/Trash/` with metadata in `/home/.z/trash.json`

**Patterns:**
- Hierarchical workspace: `/home/workspace/` (user) + `/home/.z/` (internal)
- Conversation-scoped workspaces prevent cross-contamination
- AGENTS.md provides project-specific guidance

**Gaps:**
- No formal versioning for user artifacts
- No built-in audit trail for file modifications
- No protected file system (everything is writable)

**Leverage:**
- Use conversation workspace for Project Tab temporary state
- AGENTS.md pattern for project-level guidance/remembered preferences
- Trash pattern for soft-deleted items (risks, abandoned paths)

---

## 2. MCP Infrastructure

### Available MCP Servers

**Exists:**
- **Zo-Qore MCP Proxy** (`FailSafe-Qore/zo/mcp-proxy/server.ts`):
  - Governance-first MCP proxy with actor signing, rate limiting, replay protection
  - Intercepts all MCP calls for policy evaluation
  - Supports mTLS actor binding
  - Model selection (manual/auto modes)
  - Metrics streaming to external sinks
  - Ledger integration for audit trails

**MCP Tool Patterns:**
```typescript
// MCP Request Structure
interface McpRequest {
  jsonrpc: "2.0";
  id: string | null;
  method: string;  // "tools/call", "tools/list", etc.
  params?: {
    name?: string;      // Tool name for tools/call
    arguments?: Record<string, unknown>;
    model?: string;     // Model selection
  };
}

// Tool action classification
function classifyToolAction(method: string, toolName?: string): Action {
  // READ, WRITE, DELETE, SYSTEM, etc.
}
```

**Conventions:**
- **Tool naming:** `verb_noun` pattern (e.g., `read_file`, `list_files`, `update_space_route`)
- **Error handling:** JSON-RPC 2.0 error codes with trace IDs
- **Rate limiting:** Memory or SQLite-based per-actor limits
- **Authentication:** API key header + signed actor headers
- **Decision flow:** MCP request → Qore evaluation → ALLOW/DENY → forward/reject

**Gaps:**
- No built-in MCP server for DuckDB direct access
- No MCP server for dataset discovery
- No MCP server for AGENTS.md operations

**Leverage:**
- **Qore governance:** Use MCP proxy for all Project Tab tool calls
- **Actor signing:** Every operation is attributable to a user/agent
- **Rate limiting:** Built-in protection against runaway operations
- **Audit:** All calls logged to ledger automatically
- **Model selection:** Auto-select cost-optimal models for subtasks

---

## 3. AI/Processing

### Embedding Infrastructure

**Exists:**
- **No native Zo embedding infrastructure** discovered
- **External MCP servers available** for vector search (from web research):
  - Zero-Vector MCP (persona memory + vector DB)
  - Embedding Search MCP (transcript embeddings with Turso)
  - kb-mcp-server (knowledge base with graph enhancement)
  - Neo4j vector search MCP

**Patterns:**
- MCP servers expose tools like `vector_search`, `kb_search`, `neo4j_vector_search`
- Embeddings typically use OpenAI or local transformers
- Vector databases: SQLite metadata + specialized storage

**Gaps:**
- No built-in local embedding generation
- No native Zo vector database
- No semantic similarity tools in core Zo

**Leverage:**
- **Integration path:** Create MCP server for Project Tab thought embeddings
- **Existing tools:** Zero-Vector MCP for constellation/node similarity
- **Pattern:** Embedding servers expose as MCP tools with search capabilities

---

### LLM Integration

**Exists:**
- **Zo Ask API** (`/zo/ask`) for programmatic child invocations
- **Model selection:** Auto/baseline model configuration via `QORE_ZO_BASELINE_MODEL`
- **Streaming:** Not explicitly documented, but likely supported via HTTP streaming
- **Cost management:** Token tracking in Qore runtime

**API Pattern:**
```python
import requests
import os

response = requests.post(
    "https://api.zo.computer/zo/ask",
    headers={
        "authorization": os.environ["ZO_CLIENT_IDENTITY_TOKEN"],
        "content-type": "application/json"
    },
    json={
        "input": "Your prompt here",
        "output_format": {...}  # Optional structured output
    }
)
```

**Model Selection:**
```typescript
// From FailSafe-Qore/zo/model-selection.ts
interface ZoModelSelectionResult {
  selectedModel: string;
  estimatedCostUsd: number;
  baselineModel: string;
  costSavedUsd: number;
  costSavedPercent: number;
  tokenUtilizationPercent: number;
}
```

**Gaps:**
- No explicit streaming response handling in documented patterns
- No built-in token budgeting tools
- No LLM response caching

**Leverage:**
- **Parallelization:** Use `/zo/ask` for concurrent thought analysis
- **Model selection:** Auto-choose cost-optimal models for constellation analysis
- **Cost tracking:** Qore runtime monitors token usage

---

## 4. UI Components

### Component Library

**Exists:**
- **shadcn/ui-based library** in `celestara-campaign/src/components/ui/`
- **Core components:**
  - `avatar.tsx`, `badge.tsx`, `button.tsx`, `card.tsx`
  - `drawer.tsx`, `sheet.tsx` (side panels/overlays)
  - `dropdown-menu.tsx`, `select.tsx`, `tabs.tsx`
  - `input.tsx`, `textarea.tsx`, `checkbox.tsx`
  - `chart.tsx` (recharts-based)
  - `sidebar.tsx` (full collapsible sidebar)
  - `tooltip.tsx`, `separator.tsx`, `toggle.tsx`
  - `table.tsx` (TanStack Table)

**Overlay/Modal Patterns:**
- **Drawer:** Bottom/side sliding panels (vaul-based, supports top/bottom/left/right)
- **Sheet:** Radix dialog with slide-in animations
- **Animation:** Tailwind `animate-in/animate-out` classes with slide/fade

**Input Components:**
- `textarea.tsx` - Multi-line text input
- `input.tsx` - Single-line text input
- `checkbox.tsx` - Toggle states

**Layout Patterns:**
- **Sidebar:** Collapsible with `offcanvas` mode (from `app-sidebar.tsx`)
- **Responsive:** Mobile-first with Tailwind breakpoints (`sm:`, `md:`, `lg:`)
- **Theming:** `next-themes` + CSS variables for light/dark mode

**Gaps:**
- No specialized input components (voice capture, rich text editor)
- No timeline/Gantt chart component
- No risk matrix/heatmap visualization
- No node graph/constellation visualization

**Leverage:**
- **Drawer/Sheet:** Use for Project Tab slide-out panels
- **Sidebar:** Collapse existing sidebar when Project Tab opens
- **Table:** TanStack Table for risk register items
- **Card/Badge:** Status indicators for path items
- **Tabs:** Navigate between void/constellation/plan views

---

### Navigation Patterns

**Exists:**
- **Sidebar navigation:** Hierarchical structure with main/nav/documents sections
- **Collapsible panels:** Sidebar supports `collible="offcanvas"`
- **Full-screen overlays:** Drawer/Sheet components can span viewport
- **Multi-view architecture:** `/pages/demos/` shows different page types

**Pattern from `app-sidebar.tsx`:**
```tsx
<Sidebar collapsible="offcanvas">
  <SidebarHeader />
  <SidebarContent>
    <NavMain items={navMain} />
    <NavDocuments items={documents} />
    <NavSecondary items={navSecondary} />
  </SidebarContent>
  <SidebarFooter>
    <NavUser />
  </SidebarFooter>
</Sidebar>
```

**Gaps:**
- No defined pattern for view switching within a single "mode"
- No breadcrumb navigation for drill-down views

**Leverage:**
- **Sidebar collapse:** Hide when Project Tab needs full width
- **NavMain pattern:** Extend for Project Tab sub-navigation (void/constellation/plan)

---

## 5. Security & Governance

### Actor/Auth Model

**Exists:**
- **Actor proof signing** (`FailSafe-Qore/zo/security/actor-proof.ts`):
  - HMAC-SHA256 signatures on request body
  - Headers: `x-actor-id`, `x-actor-kid`, `x-actor-ts`, `x-actor-nonce`, `x-actor-sig`
  - Replay protection via nonce tracking
  - 5-minute timestamp skew tolerance

**Proof Construction:**
```typescript
function buildActorProof(
  actorId: string,
  body: string,
  ts: string,
  nonce: string,
  secret: string,
): string {
  const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
  const payload = `${actorId}.${ts}.${nonce}.${bodyHash}`;
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}
```

**Actor Keyring:**
```typescript
class ActorKeyring {
  set(kid: string, secret: string): void;
  get(kid: string): string | undefined;
  hasAny(): boolean;
}
```

**mTLS Binding:**
- Client certificates can be bound to actor IDs
- Certificate SAN extension stores `did:myth:*` identifiers
- Stronger authentication than headers alone

**Protected Operations Pattern:**
- All MCP calls go through Qore evaluation
- Decision: `ALLOW`, `DENY`, `CONDITIONAL` (require actions)
- Required actions can be enforced before execution

**Gaps:**
- No user-facing key management UI
- No multi-user authorization model (single-user Zo computer)

**Leverage:**
- **Actor proof:** Every Project Tab operation is attributable
- **Qore governance:** Guardrails can be enforced before tool execution
- **mTLS:** Optional for higher-security deployments

---

### Audit/Ledger

**Exists:**
- **Qore Ledger Manager** (`FailSafe-Qore/ledger/engine/LedgerManager.ts`):
  - SQLite-based immutable hash chain
  - SHA256 HMAC signatures with secret from SecretStore
  - Event types: `AUDIT_PASS`, `AUDIT_FAIL`, `SYSTEM_EVENT`, etc.
  - Risk grades: L0-L4

**Ledger Entry Structure:**
```typescript
interface LedgerEntry {
  id: number;
  timestamp: string;
  eventType: LedgerEventType;
  agentDid: string;
  modelVersion?: string;
  artifactPath?: string;
  artifactHash?: string;
  riskGrade?: RiskGrade;
  payload?: Record<string, unknown>;
  entryHash: string;    // Hash of entry content
  prevHash: string;     // Links to previous entry
  signature: string;     // HMAC of entryHash
}
```

**Merkle-Chain Pattern:**
- `entryHash = SHA256(timestamp + eventType + agentDid + payload + prevHash)`
- `signature = HMAC-SHA256(entryHash, ledgerSecret)`
- `prevHash` creates chain
- Genesis entry initializes chain

**Verification:**
- `verifyChain()`: Validates all hashes and signatures
- Detects tampering of any entry

**QoreLog Pattern** (from `d-d-setting-celestara/docs/META_LEDGER.md`):
- Project-specific markdown-based ledger
- Block format with parent/child hashes
- Risk grades and status tracking

**Gaps:**
- No query interface for ledger entries
- No aggregation/visualization of audit trails
- No GDPR export tools

**Leverage:**
- **Automatic logging:** All Project Tab operations logged via Qore
- **Immutability:** Cannot tamper with decision history
- **Risk grading:** Track high-risk actions (guardrail violations, path changes)

---

## 6. Project/Context Management

### Existing Project Concepts

**Exists:**
- **Dataset as project:** Directories with `datapackage.json` are treated as projects
- **Workspace as project:** User's `/home/workspace/` contains multiple project directories
- **AGENTS.md as project memory:** Hierarchical with subdirectory-specific AGENTS.md files
- **Conversation workspace:** Per-conversation scratch space

**Dataset Project Pattern:**
```
project-name/
├── datapackage.json    # Marks as dataset/project
├── data.duckdb       # Project data
├── schema.yaml        # Data structure
├── source/           # Source materials
├── docs/             # Project documentation
│   ├── META_LEDGER.md
│   ├── CONCEPT.md
│   └── ARCHITECTURE_PLAN.md
└── AGENTS.md         # Project-specific AI guidance
```

**Project Metadata (from `d-d-setting-celestara`):**
- `META_LEDGER.md`: Merkle-chain for project decisions
- `CONCEPT.md`: High-level concept/vision
- `ARCHITECTURE_PLAN.md`: Implementation blueprint
- `SYSTEM_STATE.md`: Project state snapshot

**QoreLog Pattern:**
- Block 0: Genesis entry
- Chain metadata: Risk grade, dataset name, status
- Each block: Timestamp, parent hash, block hash, changes

**Gaps:**
- No global project registry
- No project switching UI
- No cross-project dependency tracking
- No project lifecycle (create/archive/delete) management

**Leverage:**
- **Dataset pattern:** Treat Project Tab as a dataset with DuckDB backend
- **AGENTS.md:** Store project-level preferences, guardrails, execution policies
- **META_LEDGER:** Track project decisions (path changes, risk mitigation)
- **docs/** pattern:** Store project documentation, prompts, templates

---

### Context Retrieval

**Exists:**
- **File system hierarchy:** AGENTS.md in current directory provides context
- **Conversation workspace:** Scratch files maintain in-memory context
- **Zo Ask API:** Child invocations have no parent context - must be fully self-contained
- **Skills:** Packaged workflows with bundled context

**AGENTS.md Pattern:**
- Root-level `/home/workspace/AGENTS.md` provides workspace-wide guidance
- Directory-specific AGENTS.md overrides/adds to parent context
- Personas and rules provide behavioral context

**Context Construction Pattern (from system prompt):**
> "Child invocations have NO context from the parent conversation. Each prompt you construct must be completely self-contained with ALL information the subtask needs to succeed."

**Gaps:**
- No "what was I working on" query mechanism
- No context summarization across sessions
- No persistent conversation thread storage

**Leverage:**
- **AGENTS.md:** Store Project Tab context: project goals, current phase, recent decisions
- **Dataset docs:** `README.md` patterns for "how to use this project"
- **Self-contained prompts:** Design autonomous execution prompts that include full context

---

## Summary: Build Path Recommendations

### High-Leverage Components (Reuse Directly)

1. **DuckDB Dataset Pattern** - Use as Project Tab backend
2. **Qore Governance** - All tool calls through MCP proxy for guardrails
3. **Actor Signing** - Attributable operations for audit
4. **Ledger** - Immutable audit trail of decisions
5. **UI Components** - shadcn/ui library with drawer/sidebar/table
6. **AGENTS.md** - Project-level guidance and preferences

### Build From Scratch

1. **Project Tab UI** - New React components (void capture, constellation graph, Gantt)
2. **Thought Embedding Server** - MCP server for semantic similarity
3. **Risk Assessment Engine** - Custom logic for path/decision risk grading
4. **Autonomous Execution Prompts** - Self-contained prompts for subtask execution
5. **Project Switching** - Navigation between multiple project datasets

### Integrate External

1. **Vector DB** - Use existing Zero-Vector MCP or create new
2. **Timeline/Gantt** - Build custom component or find library
3. **Voice Capture** - Browser Web Speech API (no native Zo tool)
4. **Graph Visualization** - Custom React component (no existing library)

---

## Recommended Architecture

```
project-tab/
├── datapackage.json          # Project Tab dataset marker
├── data.duckdb             # Thoughts, nodes, risks, plans
├── schema.yaml             # Auto-generated tables
├── docs/
│   ├── META_LEDGER.md       # Decision chain
│   ├── PROJECT_GOALS.md     # Project context
│   └── GUARDRAILS.md      # Governance policies
├── AGENTS.md              # Tab-specific AI guidance
├── extension/
│   ├── src/
│   │   ├── components/
│   │   │   ├── void-capture.tsx      # Quick thought capture
│   │   │   ├── constellation-view.tsx   # Node graph
│   │   │   ├── path-planner.tsx       # Gantt/timeline
│   │   │   └── risk-register.tsx       # Risk matrix
│   │   ├── stores/                     # State management
│   │   └── api/                       # MCP client wrapper
│   └── mcp-server/                    # Embedding server
│       ├── embeddings.ts
│       └── vector-search.ts
└── ingest/
    └── transform-thoughts.py   # DuckDB ingestion
```

### Data Model (DuckDB)

```sql
-- Thoughts (void capture)
CREATE TABLE thoughts (
  id VARCHAR PRIMARY KEY,
  content TEXT,
  captured_at TIMESTAMP,
  tags VARCHAR[],
  embedding_id VARCHAR  -- References vector DB
);

-- Constellation (nodes/edges)
CREATE TABLE constellation_nodes (
  id VARCHAR PRIMARY KEY,
  thought_id VARCHAR,  -- Links to thought
  title VARCHAR,
  position_x REAL,
  position_y REAL
);

CREATE TABLE constellation_edges (
  id VARCHAR PRIMARY KEY,
  source_node VARCHAR,
  target_node VARCHAR,
  relationship_type VARCHAR,  -- "related_to", "contradicts", etc.
  weight REAL
);

-- Plans (Gantt)
CREATE TABLE plan_items (
  id VARCHAR PRIMARY KEY,
  title VARCHAR,
  start_date DATE,
  end_date DATE,
  status VARCHAR,  -- "pending", "in_progress", "completed"
  dependencies VARCHAR[]  -- Array of dependent item IDs
);

-- Risk Register
CREATE TABLE risks (
  id VARCHAR PRIMARY KEY,
  description TEXT,
  likelihood INTEGER,  -- 1-5
  impact INTEGER,      -- 1-5
  mitigation TEXT,
  status VARCHAR  -- "open", "mitigated", "accepted"
);

-- Guardrails
CREATE TABLE guardrails (
  id VARCHAR PRIMARY KEY,
  rule TEXT,
  applies_to VARCHAR,  -- "thought", "plan", "execution"
  enforcement VARCHAR  -- "block", "warn", "log"
);
```

### MCP Tools to Implement

```typescript
// Project Tab MCP Server
tools: [
  "capture_thought",      // Quick capture to DuckDB
  "get_constellation",     // Fetch nodes/edges
  "update_node",          // Move/rename nodes
  "link_thoughts",       // Create edge between thoughts
  "create_plan_item",     // Add to Gantt
  "register_risk",       // Add to risk register
  "check_guardrails",     // Evaluate before actions
  "search_thoughts",     // Vector similarity search
]
```

### Governance Integration

```typescript
// All Project Tab tools go through Qore
// Example: Before deleting a node
{
  action: "DELETE",
  targetPath: "constellation_nodes/node123",
  content: "User requested deletion",
  actorId: "user:frostwulf",
  riskGrade: "L1",  // Low risk
  decision: "ALLOW"   // Approved by Qore
}
```

---

## Next Steps

1. **Create Project Tab dataset** following `d-d-setting-celestara` pattern
2. **Build embedding MCP server** for thought similarity
3. **Implement void capture component** with shadcn/ui components
4. **Design constellation graph** with drag-and-drop (dnd-kit already in deps)
5. **Integrate Qore governance** for all tool calls
6. **Create ledger pattern** for tracking project decisions
