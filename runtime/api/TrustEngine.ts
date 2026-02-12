import * as crypto from "crypto";
import { AgentIdentity } from "@mythologiq/qore-contracts/schemas/shared.types";

export class TrustEngine {
  private readonly agents = new Map<string, AgentIdentity>();

  async registerAgent(persona: string, publicKey: string): Promise<AgentIdentity> {
    const did = `did:myth:${persona}:${crypto.randomUUID()}`;
    const normalizedPersona = this.normalizePersona(persona);
    const identity: AgentIdentity = {
      did,
      persona: normalizedPersona,
      publicKey,
      trustScore: 0.5,
      trustStage: "CBT",
      isQuarantined: false,
      verificationsCompleted: 0,
      createdAt: new Date().toISOString(),
      version: 1,
    };
    this.agents.set(did, identity);
    return identity;
  }

  async updateTrust(agentDid: string, outcome: "success" | "failure"): Promise<number> {
    const identity = this.agents.get(agentDid);
    if (!identity) return 0.5;
    const delta = outcome === "success" ? 0.05 : -0.1;
    identity.trustScore = Math.max(0, Math.min(1, identity.trustScore + delta));
    identity.version += 1;
    return identity.trustScore;
  }

  private normalizePersona(value: string): AgentIdentity["persona"] {
    if (value === "sentinel" || value === "judge" || value === "overseer") {
      return value;
    }
    return "scrivener";
  }
}

