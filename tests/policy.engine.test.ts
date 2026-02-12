import * as path from "path";
import { describe, expect, it } from "vitest";
import { PolicyEngine } from "../policy/engine/PolicyEngine";

describe("PolicyEngine", () => {
  it("classifies docs as L1 and auth code as L3", async () => {
    const policyDir = path.join(process.cwd(), "policy", "definitions");
    const engine = new PolicyEngine({ policyDir });
    await engine.loadPolicies();

    expect(engine.classifyRisk("docs/overview.md")).toBe("L1");
    expect(engine.classifyRisk("src/auth/service.ts", "contains password reset flow")).toBe("L3");
  });

  it("computes SCI based on source tiers", () => {
    const engine = new PolicyEngine();
    const sci = engine.calculateSCI(["RFC 9110", "https://owasp.org/top10"]);
    expect(sci).toBeGreaterThan(0.7);
  });

  it("validates required policy definitions", () => {
    const engine = new PolicyEngine();
    const policyDir = path.join(process.cwd(), "policy", "definitions");
    const result = engine.validatePolicyDefinitions(policyDir);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});
