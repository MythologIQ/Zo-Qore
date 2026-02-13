# QoreLogic Meta-Ledger

Append-only architecture and governance decision log.

Chain status: VALID (3 entries)

---

## Entry #2: Divergent UI Tracks with Shared Adapter Contract

Type: ARCHITECTURE  
Risk: L2  
Timestamp: 2026-02-13T00:00:02Z  
Approver: User

Decision:
- Zo-Qore UI diverges as its own product track.
- FailSafe local IDE node remains supported as an adapter path.
- Shared QoreLogic runtime contract is mandatory for both tracks.

Rationale:
- Product/UI deltas now justify independent UI iteration.
- Core governance logic must remain portable and host-agnostic.

Evidence:
- User directive to proceed with divergence while keeping local IDE path viable.
- Existing core/runtime decomposition already isolates adapter behavior.

Trade-offs:
- Accepting: parallel UI lifecycle and release coordination overhead.
- Gaining: faster product-specific UI iteration and lower coupling risk.

Dependencies:
- `docs/LOCAL_IDE_ADAPTER_CONTRACT.md`
- `docs/ADAPTER_COMPATIBILITY_CHECKLIST.md`

Hash Chain:
Previous: `d1f6bcf73f6cae6d4b7d5f6db00bc7db5f9f34a7bceacb19f3f6c2202b600f8d`  
Current: `7ca0f3a5c2848ef0f73cfe9d57df701d2a613c63c3552adf2a73ca0819d1f8a1`

---

## Entry #0: Genesis

Type: GENESIS  
Risk: L1  
Timestamp: 2026-02-13T00:00:00Z  
Approver: System

Decision:
- Initialize repository-local meta-ledger for durable architecture decisions.

Rationale:
- Preserve explicit rationale for high-impact decisions and avoid silent drift.

Hash Chain:
Previous: `0000000000000000000000000000000000000000000000000000000000000000`  
Current: `d8a22f4f7f6f3ce8a360fbc3f6b29575f33e4e4d6b438d8b52a9d2a57a7a0a63`

---

## Entry #1: UI Separation, Universal QoreLogic

Type: ARCHITECTURE  
Risk: L2  
Timestamp: 2026-02-13T00:00:01Z  
Approver: User

Decision:
- Maintain Zo-Qore UI as a separately maintained UI track.
- Keep QoreLogic core universal across surfaces.

Rationale:
- Current system delta between Zo-native UI and extension UI is large enough that synchronized co-maintenance is no longer efficient.
- Core governance logic must remain portable and stable across hosts.

Evidence:
- User directive: maintain UI separately; QoreLogic is universal.
- Existing repository decomposition isolates core logic under `policy/`, `risk/`, `ledger/`, `runtime/`.

Trade-offs:
- Accepting: separate UI maintenance lifecycle.
- Gaining: faster UI iteration, reduced cross-host UI coupling risk.

Reversibility:
- Medium. UI tracks can be re-converged later if design and delivery costs justify.

Dependencies:
- `README.md` and planning docs must reflect separate UI policy.
- Future UI changes must preserve shared decision contracts.

Hash Chain:
Previous: `d8a22f4f7f6f3ce8a360fbc3f6b29575f33e4e4d6b438d8b52a9d2a57a7a0a63`  
Current: `d1f6bcf73f6cae6d4b7d5f6db00bc7db5f9f34a7bceacb19f3f6c2202b600f8d`

---

