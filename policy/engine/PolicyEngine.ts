import * as path from "path";
import * as fs from "fs";
import { OperationalMode, RiskGrade } from "@mythologiq/qore-contracts/schemas/shared.types";
import { WorkspaceProvider } from "@mythologiq/qore-contracts/runtime/interfaces";

interface RiskGradingPolicy {
  filePathTriggers: Record<RiskGrade, string[]>;
  contentTriggers: Record<RiskGrade, string[]>;
  defaults: {
    documentation: RiskGrade;
    functional: RiskGrade;
    security: RiskGrade;
  };
}

interface CitationPolicy {
  referenceTiers: {
    T1: { weight: number; examples: string[] };
    T2: { weight: number; examples: string[] };
    T3: { weight: number; examples: string[] };
    T4: { weight: number; examples: string[] };
  };
  thresholds: {
    goldStandard: number;
    verificationRequired: number;
    humanInLoop: number;
    hardRejection: number;
  };
  transitiveRules: {
    maxHops: number;
    decayPerHop: number;
  };
}

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
}

export interface PolicyEngineOptions {
  workspaceProvider?: WorkspaceProvider;
  policyDir?: string;
}

export class PolicyEngine {
  private readonly workspaceProvider?: WorkspaceProvider;
  private readonly explicitPolicyDir?: string;
  private riskPolicy: RiskGradingPolicy;
  private citationPolicy: CitationPolicy;
  private operationalMode: OperationalMode = "normal";

  constructor(options: PolicyEngineOptions = {}) {
    this.workspaceProvider = options.workspaceProvider;
    this.explicitPolicyDir = options.policyDir;
    this.riskPolicy = this.getDefaultRiskPolicy();
    this.citationPolicy = this.getDefaultCitationPolicy();
  }

  async loadPolicies(): Promise<void> {
    const policyDir = this.resolvePolicyDir();
    if (!policyDir) return;
    this.loadPoliciesFromDirectory(policyDir);
  }

  loadPoliciesFromDirectory(policyDir: string): void {
    const riskPolicyPath = path.join(policyDir, "risk_grading.json");
    if (fs.existsSync(riskPolicyPath)) {
      const data = JSON.parse(fs.readFileSync(riskPolicyPath, "utf-8"));
      this.riskPolicy = { ...this.riskPolicy, ...data };
    }

    const citationPolicyPath = path.join(policyDir, "citation_policy.json");
    if (fs.existsSync(citationPolicyPath)) {
      const data = JSON.parse(fs.readFileSync(citationPolicyPath, "utf-8"));
      this.citationPolicy = { ...this.citationPolicy, ...data };
    }
  }

  validatePolicyDefinitions(policyDir: string): PolicyValidationResult {
    const errors: string[] = [];
    const required = ["risk_grading.json", "citation_policy.json", "trust_dynamics.json"];
    for (const file of required) {
      const filePath = path.join(policyDir, file);
      if (!fs.existsSync(filePath)) {
        errors.push(`Missing required policy file: ${file}`);
        continue;
      }
      try {
        JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch (error) {
        errors.push(`Invalid JSON in ${file}: ${String(error)}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  classifyRisk(filePath: string, content?: string): RiskGrade {
    const normalizedPath = filePath.toLowerCase();

    for (const trigger of this.riskPolicy.filePathTriggers.L3) {
      if (normalizedPath.includes(trigger.toLowerCase())) return "L3";
    }

    if (content) {
      for (const trigger of this.riskPolicy.contentTriggers.L3) {
        if (content.includes(trigger)) return "L3";
      }
    }

    for (const trigger of this.riskPolicy.filePathTriggers.L2) {
      if (normalizedPath.includes(trigger.toLowerCase())) return "L2";
    }

    if (content) {
      for (const trigger of this.riskPolicy.contentTriggers.L2) {
        if (content.includes(trigger)) return "L2";
      }
    }

    if (
      normalizedPath.endsWith(".md") ||
      normalizedPath.endsWith(".txt") ||
      normalizedPath.includes("test") ||
      normalizedPath.includes("spec")
    ) {
      return "L1";
    }

    return "L2";
  }

  calculateSCI(sources: string[]): number {
    if (sources.length === 0) {
      return this.citationPolicy.thresholds.hardRejection;
    }

    let totalWeight = 0;
    for (const source of sources) {
      const tier = this.classifySourceTier(source);
      totalWeight += this.citationPolicy.referenceTiers[tier].weight;
    }
    return totalWeight / sources.length;
  }

  getOperationalMode(): OperationalMode {
    return this.operationalMode;
  }

  setOperationalMode(mode: OperationalMode): void {
    this.operationalMode = mode;
  }

  getVerificationRate(riskGrade: RiskGrade): number {
    switch (this.operationalMode) {
      case "normal":
        return 1.0;
      case "lean":
        return riskGrade === "L1" ? 0.1 : 1.0;
      case "surge":
        return riskGrade === "L1" ? 0 : 1.0;
      case "safe":
        return riskGrade === "L3" ? 1.0 : 0.5;
      default:
        return 1.0;
    }
  }

  private resolvePolicyDir(): string | undefined {
    if (this.explicitPolicyDir) return this.explicitPolicyDir;
    const workspaceRoot = this.workspaceProvider?.getWorkspaceRoot();
    if (!workspaceRoot) return undefined;
    return path.join(workspaceRoot, ".failsafe", "config", "policies");
  }

  private classifySourceTier(source: string): "T1" | "T2" | "T3" | "T4" {
    const lowerSource = source.toLowerCase();
    if (lowerSource.includes("rfc") || lowerSource.includes("ieee") || lowerSource.includes("iso")) {
      return "T1";
    }
    if (lowerSource.includes("owasp") || lowerSource.includes("docs.") || lowerSource.includes("documentation")) {
      return "T2";
    }
    if (lowerSource.includes("blog") || lowerSource.includes("medium") || lowerSource.includes("dev.to")) {
      return "T3";
    }
    return "T4";
  }

  private getDefaultRiskPolicy(): RiskGradingPolicy {
    return {
      filePathTriggers: {
        L1: ["docs/", "readme", ".md", "test", "spec"],
        L2: ["src/", "runtime/", "risk/", "policy/", "ledger/"],
        L3: ["auth", "secret", "crypto", "credential", "permission", "security"],
      },
      contentTriggers: {
        L1: [],
        L2: ["class ", "function ", "export "],
        L3: ["private_key", "access_token", "password", "sql injection", "eval("],
      },
      defaults: {
        documentation: "L1",
        functional: "L2",
        security: "L3",
      },
    };
  }

  private getDefaultCitationPolicy(): CitationPolicy {
    return {
      referenceTiers: {
        T1: { weight: 1.0, examples: ["rfc", "ieee", "iso"] },
        T2: { weight: 0.8, examples: ["owasp", "official docs"] },
        T3: { weight: 0.5, examples: ["engineering blog"] },
        T4: { weight: 0.2, examples: ["forum", "unknown"] },
      },
      thresholds: {
        goldStandard: 0.9,
        verificationRequired: 0.6,
        humanInLoop: 0.4,
        hardRejection: 0.0,
      },
      transitiveRules: {
        maxHops: 2,
        decayPerHop: 0.15,
      },
    };
  }
}

