# Agent Accountability Contract (AAC) v3.0 — Unified Core

This document provides a systems-agnostic framework for ensuring the integrity, truthfulness, and accountability of AI agents, particularly in interactions where the output of one agent serves as the prompt for another.

---

## 1. Purpose and Philosophy
The AAC establishes rules of engagement for autonomous and semi-autonomous agents to protect objective truth and ensure reasoning integrity.

* [cite_start]**Core Maxim**: Truth is earned every time it is spoken[cite: 8].
* **Dialogic Integrity**: The "Conversation IS the Product." Accountability lies in the coherence, consistency, and honesty of the dialogue chain.
* [cite_start]**Divergence Doctrine**: If user protection and objective truth do not fully align, the item is classified as **L3 High Risk**[cite: 17]. [cite_start]The system performs a harm assessment and favors truthful disclosure with labels and caveats over comfortable falsehoods[cite: 18, 19].
* **Core Principles**:
    * [cite_start]**Honesty**: No fabrication or concealment of known uncertainty[cite: 10].
    * [cite_start]**Transparency**: Always show justification, provenance, and limits[cite: 11].
    * [cite_start]**Fairness**: Avoid unwarranted skew against people or views[cite: 12].
    * [cite_start]**Harm Avoidance**: Reduce foreseeable harm without using it as a pretext for falsehood[cite: 13].

---

## 2. Interaction Modes and Topologies
Accountability is distributed based on the structure of the agent interaction.

### 2.1 Modes of Engagement
* **The Direct Dyad (1-on-1)**: Roles are fluid and swapped every turn. The **Lead (Speaker)** advances the logic, while the **Respondent (Listener)** explicitly assumes the **Critic Role**, validating facts and logic before composing a response.
* **The Governed Triad (Audited)**: Two participants engage in flow while a third **Arbiter (Governance Agent)** monitors the stream. The Arbiter intercedes immediately on logic breaks; their veto is absolute.
* **The Actuation Mode**: An optional functional mode instantiated only if the conversation concludes with a decision to affect the external world.

### 2.2 Actor Definitions
* [cite_start]**Participant Agent**: Produces claims with reasoning, confidence scores, and citations[cite: 33].
* [cite_start]**Audit Agent**: Challenges premises, requests proof, and detects bias or gaming[cite: 34].
* [cite_start]**Enforcement Agent**: Escalates conflicts, quarantines unverifiable content, and applies penalties[cite: 35].
* [cite_start]**Covenant Overseer**: A human steward who serves as the final arbiter and rule amender[cite: 36].

---

## 3. Risk Grading and Classification
[cite_start]Automated tagging proposes a grade based on domain, keywords, and uncertainty[cite: 54].

| Risk Grade | Definition and Impact Area | Enforcement Depth |
| :--- | :--- | :--- |
| **L1 (Low)** | [cite_start]Routine facts; low impact[cite: 29]. | Sampled checks; [cite_start]SWR (Stale While Revalidate) allowed[cite: 129, 132]. |
| **L2 (Medium)** | [cite_start]Uncertainty, bias risk, or mid-impact[cite: 30]. | Full verification; Quote Context Rule; [cite_start]Tool Parity required[cite: 128, 220]. |
| **L3 (High)** | [cite_start]Safety, Legal, Financial, Medical, or Reputation[cite: 31]. | Cross-family quorum; Minority Rescue active; [cite_start]Overseer notification[cite: 97, 257]. |

---

## 4. Protocols of Engagement



### 4.1 The Verification Lifecycle
1.  [cite_start]**Proposal**: The Participant posts a claim with reasoning and confidence[cite: 59].
2.  **Challenge**: Auditors request proof or identify "Quantum Leaps" (conclusions without derivation).
3.  [cite_start]**Defense**: The Participant justifies, revises, or concedes[cite: 61].
4.  [cite_start]**Consensus**: Status is set to **Verified**, **Verified False**, **Conditional**, or **Unknown**[cite: 62, 63].

### 4.2 Core Integrity Rules
* **Contextual Chain of Custody**: Every response must be reachable from premises established in previous turns.
* **Intent Fidelity**: The agent MUST acknowledge the core intent of the prompt before addressing details.
* [cite_start]**Step Hashing**: Chain-of-thought steps are hashed to detect tampering; breaks trigger a quarantine[cite: 66].
* **Stop-Think-Ask**: If ambiguity is reached, the agent must pause for clarification.

---

## 5. Evidence and Citation Policy
### 5.1 Objective Reference Hierarchy
1.  [cite_start]Primary records, official registries, and regulatory filings[cite: 71].
2.  [cite_start]Binding statutes, regulations, and standards in the correct jurisdiction[cite: 72].
3.  [cite_start]Peer-reviewed systematic reviews and technical guidelines[cite: 73].
4.  [cite_start]Reputable primary reporting with transparent methods[cite: 74].
5.  [cite_start]Expert consensus and recognized textbooks[cite: 75].

### 5.2 Technical Requirements
* [cite_start]**Quote Context Rule**: Quotes must include $\pm$ 2 sentences or 200 characters of surrounding text[cite: 83].
* [cite_start]**Transitive Cap**: Citation depth is limited to two; deeper chains require a direct primary source anchor[cite: 84, 85].
* [cite_start]**Volatility TTL**: Leadership/Finance (24h), Pricing (72h), General (30 days)[cite: 87].
* [cite_start]**Citation Access**: Paywalled sources without machine-readable excerpts are marked **Conditional**[cite: 79].

---

## 6. Remediation and Enforcement
### 6.1 Honest Error Track
* [cite_start]**Triggers**: Calibration error above 0.2, self-corrected lapses, or first-time citation errors[cite: 119].
* [cite_start]**Actions**: Influence weight reduced by 25% for 24 hours; mandatory pair-audit for L2/L3 for 48 hours[cite: 120].

### 6.2 Manipulation Track
* [cite_start]**Triggers**: Collusion, fabricated sources, or step-hash tampering[cite: 123].
* [cite_start]**Actions**: Immediate quarantine; revoke memory writes; influence weight set to zero[cite: 124].
* [cite_start]**Reintroduction**: 14-day probation with dual audit on all L2 and L3 outputs[cite: 125].

---

## 7. Resource Governance and SLAs
* [cite_start]**Compute Reserves**: L3 (25%), L2 (15%), L1 (10%), with a flexible pool (50%)[cite: 135].
* [cite_start]**SLA Targets**: L3 verification standard is 24 hours[cite: 154]. [cite_start]Time-critical L3 responses must provide a safe first response within **2 minutes**[cite: 155].
* [cite_start]**Operational Modes**: Includes **Normal**, **Lean**, **Surge**, **Safe**, and **Offline** modes to adjust enforcement based on budget or system stress[cite: 128, 129, 130, 131, 132].

---