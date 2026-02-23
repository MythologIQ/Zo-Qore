# Victor Kernel - Unified Recursive Learning System

Complete implementation of the "Digestive Data Loops" architecture for self-improving development.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│           Victor Kernel - Recursive Learning Engine           │
└─────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │  LOCAL LOOP    │
                    │ (Phase→Phase)   │
                    └───────┬─────────┘
                              │ Lessons Learned
                              │ injected into next phase
                              ▼
┌───────────────────────────────────────────────────────────────────┐
│   Plan → Audit → Implement → Substantiate (with learning)      │
└───────────────────────────────────────────────────────────────────┘
        │           │              │
        │           │              │
        ▼           ▼              ▼
   ┌─────────┐ ┌──────────┐ ┌──────────────┐
   │  Knowledge│ │  Victor   │ │  Working     │
   │  Graph   │ │  Audit    │ │  Memory     │
   │  (Atlas) │ │  Gatekeeper│ │  (Mind Map)  │
   └────┬─────┘ └─────┬────┘ └──────┬───────┘
        │              │                │
        │    Updates    │   Records      │
        │    Heatmap  │   Guardrails   │
        └──────────────┴────────────────┘
                      ▼
            ┌──────────────────┐
            │  GLOBAL LOOP    │
            │  (The Atlas)   │
            └──────────────────┘
                      │
                      ▼
            ┌──────────────────┐
            │  CROSS-PROJECT  │
            │  LOOP           │
            │  (Universal     │
            │   Truths)      │
            └──────────────────┘
```

## Components

### 1. Learning Event Schema (`learning-schema.ts`)

Standardized packet structure for all recursive learning events.

**Core Fields:**
- `id` - UUID v4
- `timestamp` - Unix timestamp (ms)
- `origin_phase` - Where learning occurred (Debug, Substantiate, Audit, Plan)

**Learning Content:**
- `trigger_type` - Why are we learning this? (Logic Error, Refactor, Performance Gain, etc.)
- `lesson` - The distilled "Universal Truth"
- `audit_constraint` - New rule for future Audit phases
- `guardrail_pattern` - Regex pattern to prevent recurrences

**Impact Analysis:**
- `debt_impact` - Heat Map score (-10 to +10)
- `debt_heat` - Low, Medium, High, Critical
- `frequency` - How often this occurs

**Metadata:**
- `context_node` - Link to specific Mind Map node
- `context_stack` - Tech stack tags
- `project_id` - Project identifier
- `session_id` - Development session

### 2. Debug Learning Flow (`learning-flows.ts`)

Captures learning from errors in the Debug loop.

**Process:**
1. Generate Learning Packet from error
2. Validate Schema
3. Index into Knowledge Graph
4. Update Frequency (if similar error exists)
5. Inject Guardrails into next Audit phase (if high impact)

**Output:**
```typescript
{
  id: "uuid",
  origin_phase: "Debug",
  trigger_type: "Logic Error",
  lesson: "Error: State must be lifted for X-type interactions",
  debt_impact: 5,
  debt_heat: "High",
  guardrail_pattern: "state.*locally.*scoped/",
  audit_constraint: "CHECK: Ensure state isn't locally scoped if Y exists"
}
```

### 3. Substantiate Learning Flow

Compares Plan vs Reality, creates delta report.

**Process:**
1. Calculate Delta (timeline, quality, unexpected issues)
2. Extract Lessons
3. Generate Learning Packet
4. Enrich with project context
5. Update Heat Map (Global Loop)
6. Inject lessons into next Audit phase (Local Loop)

**Delta Report:**
```typescript
{
  timeline_delta: 0.5,      // 50% over plan
  quality_delta: -0.2,        // Quality below expectations
  unexpected_issues: ["SVG rendering failed in Safari"],
  lessons_learned: ["Planning timelines are underestimated", "Quality acceptance criteria need refinement"]
}
```

### 4. Audit Gate Flow

Validates plan against learned constraints before implementation.

**Process:**
1. Query Knowledge Graph for Guardrails (matching tech stack)
2. Query for Universal Truths
3. Query for Similar Project Lessons
4. Validate Plan Against Constraints
5. Generate Audit Result

**If violations exist:**
- Reject plan back to Brainstorming
- Generate rejection Learning Packet
- Inject into Knowledge Graph

**Pass Condition:**
```typescript
{
  passed: true,
  enriched_with: {
    guardrails: [...],
    universal_truths: [...],
    similar_lessons: [...]
  }
}
```

### 5. SVG Learning Overlay (`svg-learning-overlay.ts`)

Dynamic visualization based on Debt_Impact and Heat Map data.

**Heat Colors:**
- **Green** (#dcfce7) - Stable, Low debt
- **Yellow** (#fef9c3) - Moderate, Medium debt
- **Orange** (#fed7aa) - Warning, High debt
- **Red** (#fecaca) - Debt-heavy, Critical

**Visual Indicators:**
- Pulsing circles on critical nodes
- Tooltips with:
  - Heat level
  - Total impact score
  - Lessons learned
  - Frequency

**CSS Classes:**
```css
.learning-indicator {
  animation: pulse 2s ease-in-out infinite;
}

.heat-critical {
  fill: #fecaca !important;
  stroke: #ef4444 !important;
}
```

### 6. Knowledge Graph (`victor-kernel-unified.ts`)

Persistent storage using DuckDB, Zo Datasets for long-term memory.

**Tables:**

```sql
CREATE TABLE learning_events (
  id VARCHAR PRIMARY KEY,
  timestamp BIGINT,
  origin_phase VARCHAR,
  context_node VARCHAR,
  context_stack JSON,
  project_id VARCHAR,
  session_id VARCHAR,
  trigger_type VARCHAR,
  lesson TEXT,
  audit_constraint TEXT,
  guardrail_pattern TEXT,
  debt_impact INTEGER,
  debt_heat VARCHAR,
  frequency INTEGER,
  tags JSON,
  universal_truth BOOLEAN,
  related_events JSON,
  verified_at BIGINT,
  effectiveness_score FLOAT
);

CREATE TABLE heatmap (
  node_id VARCHAR PRIMARY KEY,
  heat FLOAT,
  last_update BIGINT,
  lessons JSON
);
```

**Query Examples:**

```typescript
// Find guardrails for React projects
await kg.query({
  context_stack: { $in: ['React', 'TypeScript'] },
  trigger_type: 'Logic Error',
  origin_phase: 'Debug'
});

// Find universal truths
await kg.query({
  universal_truth: true,
  context_stack: { $in: ['SVG', 'Graphics'] }
});

// Find similar project lessons
await kg.query({
  context_stack: { $in: ['Node.js', 'Bun'] },
  origin_phase: 'Substantiate'
});
```

## Integration with Zo-Qore Runtime

### Phase 1: Plan (Enriched with Knowledge Graph)

```typescript
const enrichedPlan = await victor.planWithKnowledge({
  stack: ['React', 'TypeScript', 'Bun'],
  tasks: [...],
  timeline: 5 // days
});

// Returns:
{
  stack: ['React', 'TypeScript', 'Bun'],
  tasks: [...],
  timeline: 5,
  enriched_with: {
    similar_lessons: ["SVG rendering has Safari issues", "State lifting patterns"],
    universal_truths: ["SVG is more efficient than Canvas for complex graphics"],
    suggested_guardrails: ["CHECK: Ensure state isn't locally scoped", "VALIDATE: SVG paths"]
  }
}
```

### Phase 2: Audit Gate

```typescript
const auditResult = await victor.auditGate({
  stack: ['React', 'SVG'],
  tasks: [...]
}, {
  projectId: 'zo-qore-v1',
  sessionId: 'session-123',
  node: 'component-header'
});

// If passes → proceed to implement
// If fails → reject back to brainstorming with specific reasons
```

### Phase 3: Debug Loop

```typescript
try {
  await implementFeature();
} catch (error) {
  // Automatically captures learning
  const learningPacket = await victor.captureDebugLearning(
    error,
    { node: 'auth-module', stack: ['React', 'Auth'] },
    { projectId: 'zo-qore-v1', sessionId: 'session-123' }
  );
  
  // Generates guardrail for next audit
  // Updates frequency if similar error exists
}
```

### Phase 4: Substantiate

```typescript
const result = await victor.substantiatePhase({
  plan: {
    expectedOutcomes: { quality: 0.9, timeline: 5 }
  },
  reality: {
    actualOutcomes: { quality: 0.85, timeline: 7 },
    unexpectedIssues: ["Performance degradation in production"]
  },
  projectContext: { projectId: 'zo-qore-v1', sessionId: 'session-123', node: 'root' }
});

// Returns delta analysis
// Updates Global Atlas (Mind Map)
// Injects lessons into next Audit phase
```

## Deployment

### Local Development

```bash
cd /home/workspace/Victor-Kernel

# Install dependencies
bun install

# Run test suite
bun test

# Start server
bun run server
```

### Zo Integration

```bash
# Register as unified service
bash deploy-zo.sh
```

**Service Configuration:**
- Runtime: Qore (port 7777)
- Victor: Integrated as governance layer
- Database: DuckDB at `/home/workspace/.victor-learning.duckdb`

## API Endpoints

### POST `/api/victor/audit`

Validate plan against learned constraints.

```bash
curl -X POST https://frostwulf.zo.computer/api/victor/audit \
  -H "Content-Type: application/json" \
  -d '{
    "stack": ["React", "TypeScript"],
    "tasks": [...],
    "timeline": 5,
    "projectContext": {
      "projectId": "zo-qore-v1",
      "sessionId": "session-123"
    }
  }'
```

### POST `/api/victor/learn`

Record learning event from Debug or Substantiate.

```bash
curl -X POST https://frostwulf.zo.computer/api/victor/learn \
  -H "Content-Type: application/json" \
  -d '{
    "origin_phase": "Debug",
    "trigger_type": "Logic Error",
    "lesson": "State must be lifted for X-type interactions",
    "debt_impact": 5,
    "context_node": "auth-module"
  }'
```

### GET `/api/victor/heatmap`

Get heat map for visualization.

```bash
curl https://frostwulf.zo.computer/api/victor/heatmap
```

Returns:
```json
{
  "nodes": [
    {
      "id": "auth-module",
      "heat": "High",
      "totalImpact": 12,
      "frequency": 3,
      "lastUpdate": 1739644800000,
      "lessons": [
        "State must be lifted",
        "Dependency injection pattern"
      ]
    }
  ]
}
```

### POST `/api/victor/overlay-svg`

Apply learning overlay to SVG.

```bash
curl -X POST https://frostwulf.zo.computer/api/victor/overlay-svg \
  -H "Content-Type: application/json" \
  -d '{
    "svg": "<svg>...</svg>",
    "context_node": "root"
  }'
```

Returns modified SVG with color-coded heat levels and learning indicators.

## Recursive Learning in Action

### Example: Self-Correction Loop

**Cycle 1: Initial Implementation**
```
1. Plan: Build React auth module
2. Audit: No guardrails (first time)
3. Implement: Debug loop triggered - "State not properly lifted"
4. Substantiate: 3 days over timeline
```

**Learning Generated:**
```json
{
  "origin_phase": "Debug",
  "trigger_type": "Logic Error",
  "lesson": "State must be lifted for X-type interactions",
  "debt_impact": 5,
  "audit_constraint": "CHECK: Ensure state isn't locally scoped if parent exists"
}
```

**Cycle 2: Self-Corrected**
```
1. Plan: Build React auth module
2. Audit: ⛔ REJECTED - Violates guardrail "State must be lifted"
3. Brainstorm: Refactor with proper state lifting
4. Re-audit: ✅ PASSED
5. Implement: No errors
6. Substantiate: On timeline, quality 0.95
```

**Learning Updated:**
```json
{
  "origin_phase": "Substantiate",
  "trigger_type": "Performance Gain",
  "lesson": "State lifting pattern improved implementation quality by 15%",
  "debt_impact": -2,
  "effectiveness_score": 0.95
}
```

**SVG Visualization:**
- Auth module node turns **Green** (Low heat)
- Previous red indicators removed
- Tooltip shows: "State lifting validated - 15% quality improvement"

## Universal Truths

When multiple projects learn the same lesson, it becomes a **Universal Truth**:

```typescript
{
  "universal_truth": true,
  "lesson": "SVG rendering is more efficient than Canvas for complex graphics",
  "trigger_type": "Architectural Pattern",
  "debt_impact": -3,
  "context_stack": ["SVG", "Graphics", "Performance"],
  "effectiveness_score": 0.92
}
```

This truth is:
- Injected into ALL future Audits for any project using SVG
- Automatically suggested as best practice
- Shared across your entire development ecosystem

## Handoff Summary for Builders

**Core Requirement:**
Every interaction in brainstorming session and every failure in Debug loop must trigger a write-event to Knowledge Graph. The Audit phase is the "Gatekeeper" that refuses to move to Implement unless the plan accounts for "Learning Events" logged in previous cycles.

**The system must effectively "self-correct" its future planning based on past implementation hurdles.**

**Victor is not just a rules engine - it's a learning organism that:**
1. Digests errors into guardrails
2. Consolidates deltas into universal truths
3. Visualizes debt heat in real-time
4. Injects wisdom into every audit
5. Improves with every cycle

---

## Files

- `learning-schema.ts` - Learning Event Schema & Validator
- `learning-flows.ts` - Debug, Substantiate, Audit Gate flows
- `svg-learning-overlay.ts` - SVG visualization with heat colors
- `victor-kernel-unified.ts` - Unified kernel with Knowledge Graph
- `server.ts` - Zo runtime integration endpoints
- `deploy-zo.sh` - Zo deployment script

## Next Steps

1. Integrate with Qore runtime endpoints
2. Add SVG rendering endpoint for Mind Map
3. Implement UI for visualizing heat maps
4. Connect to AgentMesh for multi-agent coordination
5. Add cross-project learning sharing

---

**Victor is ready to serve as your deterministic governance layer with recursive learning! 🎯**
