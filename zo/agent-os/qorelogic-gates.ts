/**
 * QoreLogic Tribunal — Kernel Enforcement Gates
 * 
 * Phase 1 implementation for Builder Console.
 * These hooks enforce the hard rules that cannot be bypassed
 * by prompt engineering or user override.
 * 
 * Personas:
 * - Governor: Align/Encode phases (architecture, planning)
 * - Judge: Gate/Substantiate phases (security audit, veto)
 * - Specialist: Implement phase (code execution)
 */

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type Persona = "Governor" | "Judge" | "Specialist";
export type RiskLevel = "L1" | "L2" | "L3";
export type Operation = "read" | "write" | "create" | "delete";

export interface Violation {
  type: string;
  message: string;
  file: string;
  line?: number;
  severity: "error" | "warning" | "info";
}

export interface RazorViolation extends Violation {
  type: "FUNCTION_LENGTH" | "FILE_LENGTH" | "INDENT_DEPTH";
  actual: number;
  limit: number;
}

export interface SecurityViolation extends Violation {
  type: "SECURITY_STUB" | "HARDCODED_SECRET" | "INSECURE_PATTERN";
  pattern?: string;
}

export interface TribunalGateResult {
  allowed: boolean;
  persona: Persona;
  violations: Violation[];
  riskLevel: RiskLevel;
  requiresJudgeReview: boolean;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────
// THE RAZOR (§4) — Governor & Specialist enforcement
// ─────────────────────────────────────────────────────────────

export const RAZOR_CONFIG = {
  MAX_FUNCTION_LINES: 40,
  MAX_FILE_LINES: 250,
  MAX_INDENT_DEPTH: 3,
  ENABLED: true,
};

/**
 * Enforces the Simplicity Razor:
 * - Max 40 lines per function
 * - Max 250 lines per file
 * - Max 3 indentation levels
 */
export function enforceRazor(
  content: string,
  filePath: string
): { passed: boolean; violations: RazorViolation[] } {
  if (!RAZOR_CONFIG.ENABLED) {
    return { passed: true, violations: [] };
  }

  const violations: RazorViolation[] = [];
  const lines = content.split("\n");

  // File length check
  if (lines.length > RAZOR_CONFIG.MAX_FILE_LINES) {
    violations.push({
      type: "FILE_LENGTH",
      message: `File exceeds ${RAZOR_CONFIG.MAX_FILE_LINES} lines (${lines.length})`,
      file: filePath,
      severity: "error",
      actual: lines.length,
      limit: RAZOR_CONFIG.MAX_FILE_LINES,
    });
  }

  // Function length check
  const functionViolations = detectLongFunctions(content, filePath);
  violations.push(...functionViolations);

  // Indentation check
  const indentViolations = detectDeepNesting(content, filePath);
  violations.push(...indentViolations);

  return {
    passed: violations.length === 0,
    violations,
  };
}

function detectLongFunctions(
  content: string,
  filePath: string
): RazorViolation[] {
  const violations: RazorViolation[] = [];
  const lines = content.split("\n");
  
  let inFunction = false;
  let functionStart = 0;
  let braceCount = 0;
  let functionName = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Detect function start (simplified)
    if (!inFunction && /function\s+\w+|=>\s*{|\(\s*\)\s*{/.test(line)) {
      inFunction = true;
      functionStart = i;
      const match = line.match(/function\s+(\w+)/);
      functionName = match ? match[1] : "anonymous";
      braceCount = (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
    } else if (inFunction) {
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      
      if (braceCount <= 0) {
        const functionLength = i - functionStart + 1;
        if (functionLength > RAZOR_CONFIG.MAX_FUNCTION_LINES) {
          violations.push({
            type: "FUNCTION_LENGTH",
            message: `Function "${functionName}" exceeds ${RAZOR_CONFIG.MAX_FUNCTION_LINES} lines (${functionLength})`,
            file: filePath,
            line: functionStart + 1,
            severity: "error",
            actual: functionLength,
            limit: RAZOR_CONFIG.MAX_FUNCTION_LINES,
          });
        }
        inFunction = false;
      }
    }
  }

  return violations;
}

function detectDeepNesting(
  content: string,
  filePath: string
): RazorViolation[] {
  const violations: RazorViolation[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.search(/\S/);

    if (indent > 0) {
      const depth = Math.floor(indent / 2); // Assuming 2-space indent

      if (depth > RAZOR_CONFIG.MAX_INDENT_DEPTH) {
        violations.push({
          type: "INDENT_DEPTH",
          message: `Nesting exceeds ${RAZOR_CONFIG.MAX_INDENT_DEPTH} levels (depth: ${depth})`,
          file: filePath,
          line: i + 1,
          severity: "warning",
          actual: depth,
          limit: RAZOR_CONFIG.MAX_INDENT_DEPTH,
        });
      }
    }
  }

  return violations;
}

// ─────────────────────────────────────────────────────────────
// SECURITY STUB DETECTION — Judge enforcement
// ─────────────────────────────────────────────────────────────

export const SECURITY_PATTERNS = [
  { pattern: /\/\/\s*TODO/i, name: "TODO" },
  { pattern: /\/\/\s*FIXME/i, name: "FIXME" },
  { pattern: /\/\/\s*HACK/i, name: "HACK" },
  { pattern: /\/\/\s*XXX/i, name: "XXX" },
  { pattern: /pass\s*[=:]\s*['"`][^'"`]+['"`]/i, name: "HARDCODED_PASSWORD" },
  { pattern: /api[_-]?key\s*[=:]\s*['"`][^'"`]+['"`]/i, name: "HARDCODED_API_KEY" },
  { pattern: /secret\s*[=:]\s*['"`][^'"`]+['"`]/i, name: "HARDCODED_SECRET" },
  { pattern: /token\s*[=:]\s*['"`][^'"`]+['"`]/i, name: "HARDCODED_TOKEN" },
];

export const SECURITY_PATHS = [
  /\/security\//i,
  /\/auth\//i,
  /\/pii\//i,
  /\/secrets\//i,
  /\/credentials\//i,
  /\/api\/.*auth/i,
  /\/middleware\/.*auth/i,
];

/**
 * Detects security stubs and hardcoded secrets in files.
 * Escalates risk level to L3 for files in security paths.
 */
export function detectSecurityStubs(
  content: string,
  filePath: string
): { passed: boolean; violations: SecurityViolation[]; riskLevel: RiskLevel } {
  const violations: SecurityViolation[] = [];
  let riskLevel: RiskLevel = "L1";

  const isSecurityPath = SECURITY_PATHS.some((p) => p.test(filePath));

  if (isSecurityPath) {
    riskLevel = "L3";
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      for (const { pattern, name } of SECURITY_PATTERNS) {
        if (pattern.test(lines[i])) {
          violations.push({
            type: name.includes("HARDCODED") ? "HARDCODED_SECRET" : "SECURITY_STUB",
            message: `Security issue detected (${name}): ${lines[i].trim().substring(0, 50)}...`,
            file: filePath,
            line: i + 1,
            severity: "error",
            pattern: name,
          });
        }
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    riskLevel,
  };
}

// ─────────────────────────────────────────────────────────────
// MERKLE CHAIN VALIDATION — Judge enforcement
// ─────────────────────────────────────────────────────────────

export interface MerkleEntry {
  hash: string;
  previousHash: string;
  timestamp: string;
  operation: string;
  file?: string;
  persona: Persona;
}

/**
 * Validates the integrity of the Merkle chain in META_LEDGER.md.
 */
export async function validateMerkleChain(
  ledgerPath: string
): Promise<{ valid: boolean; headHash: string | null; error?: string }> {
  try {
    if (!fs.existsSync(ledgerPath)) {
      return { valid: false, headHash: null, error: "Ledger file not found" };
    }

    const content = await fs.promises.readFile(ledgerPath, "utf-8");
    const entries = parseMerkleEntries(content);

    if (entries.length === 0) {
      return { valid: true, headHash: null };
    }

    // Validate chain integrity
    for (let i = 1; i < entries.length; i++) {
      const current = entries[i];
      const previous = entries[i - 1];

      if (current.previousHash !== previous.hash) {
        return {
          valid: false,
          headHash: entries[entries.length - 1].hash,
          error: `Chain broken at entry ${i}: previous_hash mismatch`,
        };
      }

      // Verify hash
      const computedHash = computeHash(previous);
      if (current.previousHash !== computedHash) {
        return {
          valid: false,
          headHash: entries[entries.length - 1].hash,
          error: `Hash mismatch at entry ${i}`,
        };
      }
    }

    return { valid: true, headHash: entries[entries.length - 1].hash };
  } catch (err) {
    return {
      valid: false,
      headHash: null,
      error: (err as Error).message,
    };
  }
}

function parseMerkleEntries(content: string): MerkleEntry[] {
  const entries: MerkleEntry[] = [];
  const entryPattern =
    /## Entry.*?\n- \*\*Hash:\*\* `([^`]+)`\n- \*\*Previous:\*\* `([^`]+)`\n- \*\*Timestamp:\*\* ([^\n]+)\n- \*\*Operation:\*\* ([^\n]+)\n(?:- \*\*File:\*\* ([^\n]+)\n)?- \*\*Persona:\*\* ([^\n]+)/gs;

  let match;
  while ((match = entryPattern.exec(content)) !== null) {
    entries.push({
      hash: match[1],
      previousHash: match[2],
      timestamp: match[3],
      operation: match[4],
      file: match[5],
      persona: match[6] as Persona,
    });
  }

  return entries;
}

function computeHash(entry: MerkleEntry): string {
  const data = `${entry.previousHash}|${entry.timestamp}|${entry.operation}|${entry.file || ""}|${entry.persona}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

// ─────────────────────────────────────────────────────────────
// GHOST PREVENTION — Governor enforcement
// ─────────────────────────────────────────────────────────────

/**
 * Checks if a file is connected to the build path.
 * Returns orphan status and list of connected files.
 */
export function checkBuildPath(
  filePath: string,
  projectRoot: string
): { isOrphan: boolean; connectedFiles: string[]; error?: string } {
  try {
    const entryPoints = [
      "main.ts",
      "main.tsx",
      "index.ts",
      "index.tsx",
      "App.tsx",
      "server.ts",
      "start.ts",
    ];

    const fileName = path.basename(filePath);
    if (entryPoints.includes(fileName)) {
      return { isOrphan: false, connectedFiles: [filePath] };
    }

    const importPattern = new RegExp(
      `from ['"][^'"]*${fileName.replace(/\.[^.]+$/, "")}['"]`,
      "g"
    );
    const connectedFiles: string[] = [];

    const dirsToCheck = ["src", "lib", "components", "pages", "routes"];
    for (const dir of dirsToCheck) {
      const dirPath = path.join(projectRoot, dir);
      if (fs.existsSync(dirPath)) {
        const files = getAllTsFiles(dirPath);
        for (const file of files) {
          const content = fs.readFileSync(file, "utf-8");
          if (importPattern.test(content)) {
            connectedFiles.push(file);
          }
        }
      }
    }

    return {
      isOrphan: connectedFiles.length === 0,
      connectedFiles,
    };
  } catch (err) {
    return {
      isOrphan: false,
      connectedFiles: [],
      error: (err as Error).message,
    };
  }
}

function getAllTsFiles(dir: string): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

// ─────────────────────────────────────────────────────────────
// SHADOW GENOME — Failure Mode Logging
// ─────────────────────────────────────────────────────────────

export interface ShadowGenomeEntry {
  timestamp: string;
  failureMode: string;
  file?: string;
  persona: Persona;
  details: string;
}

/**
 * Logs a failure mode to the Shadow Genome for learning purposes.
 */
export async function logToShadowGenome(
  projectRoot: string,
  entry: ShadowGenomeEntry
): Promise<{ success: boolean; error?: string }> {
  try {
    const shadowGenomePath = path.join(projectRoot, "docs", "SHADOW_GENOME.md");

    const header = `# Shadow Genome

Failure modes and rejected approaches for learning purposes.

---

`;

    let content = "";
    if (fs.existsSync(shadowGenomePath)) {
      content = await fs.promises.readFile(shadowGenomePath, "utf-8");
    } else {
      content = header;
    }

    const newEntry = `
## Failure Mode - ${entry.timestamp}
- **Failure:** ${entry.failureMode}
- **Persona:** ${entry.persona}
${entry.file ? `- **File:** ${entry.file}` : ""}
- **Details:** ${entry.details}

---

`;

    await fs.promises.writeFile(shadowGenomePath, content + newEntry, "utf-8");
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────
// TRIBUNAL GATE — Combined enforcement
// ─────────────────────────────────────────────────────────────

/**
 * Main gate function that combines all enforcement rules.
 * Determines which persona's rules apply and runs all checks.
 */
export async function tribunalGate(
  content: string,
  filePath: string,
  operation: Operation,
  projectRoot?: string
): Promise<TribunalGateResult> {
  const violations: Violation[] = [];
  let riskLevel: RiskLevel = "L1";
  let requiresJudgeReview = false;

  const isSecurityPath = SECURITY_PATHS.some((p) => p.test(filePath));
  const persona: Persona = isSecurityPath ? "Judge" : "Specialist";

  // Read operations don't need enforcement
  if (operation === "read") {
    return {
      allowed: true,
      violations: [],
      riskLevel: "L1",
      requiresJudgeReview: false,
      timestamp: new Date().toISOString(),
    };
  }

  // Apply Razor (all write/create operations)
  const razorResult = enforceRazor(content, filePath);
  violations.push(...razorResult.violations);

  // Apply Security Stub Detection (security paths)
  if (isSecurityPath) {
    const securityResult = detectSecurityStubs(content, filePath);
    violations.push(...securityResult.violations);
    riskLevel = securityResult.riskLevel;
    requiresJudgeReview = true;
  }

  // Apply Ghost Prevention (create operations)
  if (operation === "create" && projectRoot) {
    const buildResult = checkBuildPath(filePath, projectRoot);
    if (buildResult.isOrphan) {
      violations.push({
        type: "ORPHAN_FILE",
        message: `File is not connected to build path`,
        file: filePath,
        severity: "warning",
      });
    }
  }

  return {
    allowed: violations.filter((v) => v.severity === "error").length === 0 && !requiresJudgeReview,
    persona,
    violations,
    riskLevel,
    requiresJudgeReview,
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────

export default {
  enforceRazor,
  detectSecurityStubs,
  validateMerkleChain,
  checkBuildPath,
  logToShadowGenome,
  tribunalGate,
  RAZOR_CONFIG,
  SECURITY_PATTERNS,
  SECURITY_PATHS,
};
