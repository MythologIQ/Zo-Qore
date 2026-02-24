

# Post-Phase 11: Autonomous Worker Focus Areas

After Phase 11 seals the planning pipeline's storage, governance, and API backbone, the system has **data integrity and policy enforcement** but lacks **polish, performance, usability maturity, and developer experience automation**. Here's what autonomous workers should target, organized by the dimensions you named.

---

## 1. UI/UX — The Largest Gap

Phase 10 delivered empty states and navigation. Phase 11C.3 wires views to live data. But the actual *interaction design* is skeletal. This is where the most user-visible value remains unrealized.

### 1A. Design System & Component Library

The UI is vanilla JS with no shared component vocabulary. Every view will independently reinvent buttons, form controls, status badges, cards, and modals — creating visual inconsistency immediately.

**What to build:**
- A minimal component kit: `Button`, `Card`, `Badge`, `StatusIndicator`, `Modal`, `FormField`, `EmptyState` (refactored from existing), `DataTable`, `Toast/Notification`
- CSS custom properties (design tokens) for color, spacing, typography, elevation — applied globally, consumed by all views
- A single `tokens.css` file that defines the visual language: brand colors, semantic colors (success/warning/danger/info), font stack, spacing scale, border radii, shadows
- Component documentation page (served at `/ui/components` in dev mode) showing all components with states

**Why this is first:** Every subsequent UI task will either use this system or create debt. Building views without it means reworking them later. The 6-view pipeline is complex enough that inconsistency across views will destroy perceived quality.

**Specific patterns to standardize:**
| Pattern | Current State | Target |
|---|---|---|
| Loading states | None visible | Skeleton screens per view, spinner component |
| Error display | Raw API errors | Contextual inline errors with recovery actions |
| Empty states | Implemented (Phase 10) | Refactor to shared `EmptyState` component with action CTA |
| Status badges | None | `Badge` with semantic colors for pipeline/task/risk status |
| Form validation | None | Inline validation with debounced checks, accessible error messages |
| Confirmations | None | Modal for destructive actions (delete project, archive) |

### 1B. View-Specific Interaction Design

Each of the six views has distinct interaction needs that go well beyond "show data from API":

**Void View:**
- Real-time thought capture with auto-save (debounced POST, not explicit save button)
- STT integration should show live transcription feedback, not just submit-and-wait
- Tag input with autocomplete from existing tags across project
- Thought list with inline editing, swipe-to-tag (mobile), keyboard shortcuts (desktop)
- Visual indicator of capture source (mic icon vs. keyboard icon)

**Reveal View:**
- Drag-and-drop thoughts into clusters (this is the core interaction — organizing raw captures)
- Unclaimed thought pool visible alongside cluster workspace
- Cluster card with expandable thought list, inline notes editing
- Visual feedback when a thought is claimed: animate from pool to cluster
- Split-pane layout: unclaimed thoughts left, clusters right

**Constellation View:**
- This is a **graph/node editor** — the most complex UI surface
- Canvas-based or SVG node rendering with pan/zoom
- Drag nodes to position, draw edges between them
- Edge labels (relationship description) editable inline
- Edge weight visualized as line thickness or color intensity
- Layout algorithms (force-directed, hierarchical) as user options
- Mini-map for large constellations
- Consider using a lightweight library (e.g., `elkjs` for layout, or a custom SVG renderer) — but evaluate against the no-framework constraint

**Path View:**
- Phase cards in ordinal order (vertical timeline or kanban columns by status)
- Task list within each phase with checkbox toggles for status
- Drag-to-reorder phases (updates ordinals via API)
- Acceptance criteria as a checklist within each task
- Source cluster references as clickable links back to Constellation view
- Progress bar per phase (tasks done / total)

**Risk View:**
- Risk register as a sortable, filterable table
- Risk matrix visualization (likelihood × impact grid with dots)
- Color-coded rows by risk status
- Inline editing for mitigation and status
- Filter by phase, status, severity

**Autonomy View:**
- Guardrail list with enforcement level toggles (block/warn/log)
- Approval gate configuration with timeout sliders
- Victor mode selector (support/challenge/mixed/red-flag) with explanation of each
- Activation gate: clearly show blocking conditions (risk review required) with links to resolve
- Live Victor stance indicator

### 1C. Cross-View Navigation & Context

The pipeline is sequential (Void→Autonomy) but users won't always work linearly. Cross-view context is critical:

- **Breadcrumb trail** showing current position in pipeline
- **Pipeline progress bar** in the nav sidebar showing which stages have content
- **Cross-references as links**: clicking a cluster ID in Path view navigates to that cluster in Reveal
- **Contextual "what's needed next" prompt**: when a view is complete, suggest the next step (already partially in nav-state API via `recommendedNext`)
- **View transition animations**: subtle slide or fade when switching views to reinforce the pipeline metaphor
- **Persistent project header**: project name, integrity status dot, Victor stance badge — visible on every view

### 1D. Accessibility (a11y)

This is non-negotiable for production quality:

- WCAG 2.1 AA compliance as the target
- Semantic HTML throughout (proper heading hierarchy, landmark regions, form labels)
- Keyboard navigation for all interactions (tab order, focus management, escape to close modals)
- ARIA attributes for dynamic content (live regions for status updates, role attributes for custom components)
- Color contrast ratios meeting AA minimums (4.5:1 for normal text, 3:1 for large text)
- Screen reader testing (at minimum: VoiceOver on macOS, NVDA on Windows)
- Focus indicators visible and styled (not browser default, not removed)
- Skip-to-content link
- Reduced motion support (`prefers-reduced-motion` media query)

### 1E. Responsive Design

The current UI shell likely targets desktop. Planning tools are increasingly used on tablets and occasionally phones:

- Breakpoint system: desktop (>1024px), tablet (768-1024px), mobile (<768px)
- Sidebar collapses to hamburger on mobile
- Constellation view adapts to touch interactions (pinch-to-zoom, tap-to-select)
- Tables collapse to card layouts on narrow screens
- STT/voice capture should work well on mobile (primary use case for Void capture on the go)

---

## 2. Development Process Effectiveness

### 2A. Automated Quality Pipeline

The release gate (`npm run release:gate`) exists but runs manually. Autonomous workers should not need to remember to run it.

**What to build:**
- **Pre-commit hooks** (via `husky` or simple git hooks): typecheck + lint on staged files only (fast)
- **Pre-push hooks**: full test suite
- **CI pipeline definition** (GitHub Actions workflow): typecheck → lint → test → build → release:gate → planning integrity checks
- **Branch protection rules**: require CI pass before merge
- **Automated test result reporting**: summary comment on PRs with test counts, coverage delta, Razor compliance

**Why:** Every autonomous worker currently relies on discipline to run the gate. Automation removes that dependency. The 561+ test count means test runs take time — parallelize in CI.

### 2B. Code Generation & Scaffolding

Phase 11 revealed a pattern: each new "view" in the pipeline requires contracts + store + policy + API route + UI wiring + tests. This is repeatable.

**What to build:**
- `npm run scaffold:view <name>` — generates the full file set for a new pipeline view:
  - Contract interfaces in `contracts/src/planning/<name>.ts`
  - Store in `runtime/planning/<Name>Store.ts`
  - Policy rules skeleton in `policy/planning/<name>-policies.ts`
  - API route skeleton in `runtime/service/planning-routes-<name>.ts`
  - Test file skeletons in `tests/planning/<name>-*.test.ts`
  - UI view skeleton in `zo/ui-shell/shared/<name>.js`
- Template files for each with TODO markers
- Scaffold script validates naming conventions and Razor compliance

### 2C. Developer Documentation

The codebase has inline JSDoc but lacks developer onboarding documentation:

- **Architecture guide** (`docs/ARCHITECTURE.md`): how governance bus, planning pipeline, Victor, and Zo adapters interconnect — with diagrams
- **Contributing guide** (`CONTRIBUTING.md`): how to add a view, how to add a policy rule, how to add an API endpoint, how to add a Victor rule
- **API reference** (auto-generated from route definitions or OpenAPI spec): every endpoint with request/response shapes, auth requirements, error codes
- **Decision log** (`docs/decisions/`): ADR (Architecture Decision Records) for key choices — why JSONL for Void, why no external DB, why vanilla JS for UI, why file-based checksums

### 2D. Testing Strategy Maturation

531+ tests exist but the test taxonomy isn't explicit:

**What to formalize:**
- **Unit tests** (fast, isolated, mock I/O): contracts validation, policy rule logic, integrity check logic, checksum computation
- **Integration tests** (touch filesystem/API): store operations, API endpoint request/response, ledger consistency
- **End-to-end tests** (full pipeline): thought capture through autonomy activation, including policy enforcement
- **Snapshot tests** (optional, for UI): rendered view HTML for regression detection
- **Performance benchmarks** (new): store read/write latency with 1K/10K/100K thoughts, API response times under load

**Test infrastructure:**
- Test fixtures: standardized project data sets (empty project, partially complete project, fully complete project, corrupt project)
- Test factories: `createTestThought()`, `createTestCluster()`, etc. — DRY up test setup
- Shared temp directory management for filesystem tests (currently likely per-test; should be centralized cleanup)

---

## 3. Efficiency & Performance

### 3A. Store Performance at Scale

The JSONL/JSON file-based store works for small projects. But what happens with 10,000 thoughts? 500 clusters?

**What to measure and optimize:**
- **Read performance**: `VoidStore.getThoughts()` reads the entire JSONL file. Add pagination: `getThoughts({ offset, limit, filter })` at the store level, not just API level
- **Write performance**: JSONL append is O(1) — good. JSON replace for view stores is O(n) — acceptable until files are large. Monitor file sizes.
- **Checksum computation**: `StoreIntegrity.updateChecksums()` hashes every file on every write. For large projects, hash only the changed file. Track dirty state.
- **Integrity check performance**: `IntegrityChecker.runAllChecks()` reads all stores. For large projects, cache check results with invalidation on mutation.
- **Index files**: For Void thoughts, consider a lightweight index file (thought ID → byte offset in JSONL) for O(1) lookups by ID instead of scanning

### 3B. API Response Optimization

- **Response pagination** on all list endpoints: `GET /api/projects/:projectId/void/thoughts?page=1&limit=50`
- **Sparse field selection**: `?fields=thoughtId,content,status` to reduce payload size
- **ETags / conditional requests**: `If-None-Match` header support so clients don't re-fetch unchanged data
- **Batch endpoints**: `POST /api/projects/:projectId/void/thoughts/batch` for importing multiple thoughts at once (e.g., from a brainstorming session)
- **Response compression**: gzip middleware if not already present

### 3C. UI Performance

- **Lazy loading**: Don't fetch all views' data on project open. Fetch only the active view's data.
- **Optimistic updates**: When adding a thought, show it immediately in the UI and confirm/rollback on API response
- **Debounced saves**: For inline editing (cluster notes, risk mitigation text), debounce API calls (300-500ms)
- **Virtual scrolling**: For Void thoughts list with thousands of entries, render only visible items
- **Service worker**: Cache static assets and API responses for offline-capable experience (especially relevant for Zo deployment)

---

## 4. Clarity — Making the System Self-Explaining

### 4A. Error Messages and Guidance

Every policy denial, integrity check failure, and Victor red flag should tell the user **what happened, why, and what to do**:

```
Current: "Policy denied: plan-001"
Target:  "Cannot create clusters yet — capture at least one thought in Void first. 
          [Go to Void →]"
```

**Standard error shape for UI consumption:**
```typescript
interface UserFacingError {
  code: string;           // 'POLICY_DENIED' | 'INTEGRITY_FAILURE' | ...
  title: string;          // Short human summary
  detail: string;         // Full explanation
  resolution: string;     // What the user should do
  link?: string;          // View/route to navigate to for resolution
  severity: 'info' | 'warning' | 'error' | 'critical';
}
```

### 4B. Prompt Transparency Enhancement

Phase 11C.4 adds planning events to prompt transparency. But transparency should be **proactive, not just logged**:

- **Decision timeline** in the UI: a collapsible panel showing recent governance decisions with reasoning
- **"Why was this blocked?"** button on any denied action — shows the policy rule, its rationale, and the project state that triggered it
- **Victor reasoning display**: when Victor challenges or red-flags, show the specific findings in the UI, not just the stance

### 4C. Onboarding & Empty-Project Experience

A new user creates a project and sees... what? The empty states exist (Phase 10) but the *guided flow* doesn't:

- **First-project wizard**: "Welcome to Zo-Qore. Let's capture your first thought." → guided walk through Void → Reveal → etc.
- **Contextual tooltips**: on first visit to each view, explain what this stage does and how it fits the pipeline
- **Example project**: ship a pre-built example project that users can explore to understand the full pipeline (also useful for demos and testing)
- **Pipeline explanation page**: visual explanation of the Void→Autonomy flow with descriptions of each stage

---

## 5. Consistency — Enforcing Uniformity Across the System

### 5A. API Contract Consistency

Audit all endpoints for consistency:

| Dimension | Standard to enforce |
|---|---|
| URL patterns | Always plural nouns: `/thoughts`, `/clusters`, `/phases`, `/entries` |
| HTTP methods | GET=read, POST=create, PUT=full replace, PATCH=partial update, DELETE=remove |
| Response envelope | `{ data: T, meta?: { pagination, integrity } }` for success; `{ error: UserFacingError }` for failure |
| Status codes | 200=success, 201=created, 204=deleted, 400=bad request, 401=unauth, 403=policy denied, 404=not found, 409=conflict, 422=validation, 500=server |
| Timestamps | ISO 8601 everywhere, UTC |
| IDs | UUIDv4 everywhere |
| Pagination | `{ page, limit, total, hasMore }` in meta |

### 5B. State Management Consistency

Each view manages state differently because there's no shared pattern. Define one:

```
View loads → fetch data from API → render → 
User acts → optimistic UI update → API call → 
  success: confirm UI state
  failure: rollback UI state + show error
```

Implement this as a shared utility:
```typescript
// Shared state management pattern for views
class ViewState<T> {
  data: T | null;
  loading: boolean;
  error: UserFacingError | null;
  
  async fetch(apiFn: () => Promise<T>): void;
  async mutate(apiFn: () => Promise<T>, optimistic: T): void;
}
```

### 5C. Naming Conventions

Document and enforce:
- Files: `kebab-case.ts` for modules, `PascalCase.ts` for classes
- Interfaces: `PascalCase`, no `I` prefix (already the pattern)
- Action constants: `planning:<view>:<operation>` (already defined)
- Test files: `<module-name>.test.ts`
- API routes: `/api/<resource>` plural
- Store methods: `get*`, `create*`, `update*`, `delete*`, `list*`
- Policy rule IDs: `plan-NNN`
- Check IDs: `PL-<category>-NN`

### 5D. Logging & Observability Consistency

- Structured JSON logging with consistent fields: `{ timestamp, level, component, action, projectId?, actorId?, duration?, error? }`
- Request logging middleware with correlation IDs
- Performance timing on store operations and policy evaluations
- Health endpoint enhancement: include planning store health (disk space, file count, last integrity check)

---

## 6. Priority Sequencing

What order should autonomous workers tackle these in?

```
IMMEDIATE (Phase 12 — "Interaction Foundation")
│
├── Design tokens + component library (1E → everything else)
├── Error message standardization (4A → usability)
├── API contract audit + consistency pass (5A → reliability)
├── Pre-commit/CI hooks (2A → process safety)
│
├── GATE: Components documented, API consistent, CI automated
│
NEXT (Phase 13 — "View Maturity")
│
├── Void view: real-time capture + STT feedback
├── Reveal view: drag-and-drop clustering
├── Path view: phase timeline + task management
├── Risk view: register table + matrix visualization
├── Cross-view navigation + breadcrumbs
│
├── GATE: All 6 views interactive with live data
│
THEN (Phase 14 — "Constellation & Polish")
│
├── Constellation view: node graph editor (most complex UI)
├── Autonomy view: guardrail configuration
├── Onboarding wizard + example project
├── Responsive design pass
├── Accessibility audit + remediation
│
├── GATE: WCAG AA, responsive, onboarding complete
│
FINALLY (Phase 15 — "Scale & Resilience")
│
├── Store pagination + indexing
├── API response optimization (ETags, compression, batch)
├── UI virtual scrolling + service worker
├── Performance benchmarks + regression tests
├── Developer documentation + ADRs
│
└── GATE: Handles 10K thoughts, sub-200ms API, docs complete
```

---

## 7. The Meta-Point

Phase 11 built the **governance backbone** — the system can store, verify, and policy-check planning data. But governance without usability is bureaucracy. The autonomous worker priority after Phase 11 should shift decisively toward **making the governed pipeline feel effortless to use**.

The design system and component library is the single highest-leverage investment. Every hour spent there saves ten hours across six views. Build it first, build it well, and every subsequent view implementation inherits visual and interaction consistency for free.