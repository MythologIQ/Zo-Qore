import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { join } from "path";
import type {
  VoidThoughtRef,
  RevealClusterRef,
  ConstellationMapRef,
  PathPhaseRef,
  RiskEntryRef,
  AutonomyConfigRef,
  QoreProject,
  FullProjectState,
} from "@mythologiq/qore-contracts";

export const VIEW_MAP: Record<string, { dir: string; file: string }> = {
  void: { dir: "void", file: "thoughts.jsonl" },
  reveal: { dir: "reveal", file: "clusters.json" },
  constellation: { dir: "constellation", file: "map.json" },
  path: { dir: "path", file: "phases.json" },
  risk: { dir: "risk", file: "register.json" },
  autonomy: { dir: "autonomy", file: "config.json" },
};

export function computeChecksum(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function loadViewData<T>(
  projectPath: string,
  dir: string,
  file: string,
): Promise<T | null> {
  const filePath = join(projectPath, dir, file);
  try {
    const content = await readFile(filePath, "utf8");
    if (file.endsWith(".jsonl")) {
      const lines = content
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
      return lines as T;
    }
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export function formatThoughtsMarkdown(thoughts: VoidThoughtRef[]): string {
  if (thoughts.length === 0) return "_No thoughts captured_";
  return thoughts
    .map(
      (t) =>
        `- ${t.content} [\`${t.source}\`] (\`${new Date(t.capturedAt).toISOString()}\`)`,
    )
    .join("\n");
}

export function formatClustersMarkdown(clusters: RevealClusterRef[]): string {
  if (clusters.length === 0) return "_No clusters formed_";
  return clusters
    .map(
      (c) =>
        `### ${c.label}\n\n**Status:** ${c.status}\n\n**Thoughts:** ${c.thoughtIds.length}\n\n${c.notes || "_No notes_"}`,
    )
    .join("\n\n---\n\n");
}

export function formatConstellationMarkdown(
  constellation: ConstellationMapRef | null,
): string {
  if (!constellation) return "_Constellation not mapped_";
  if (constellation.nodes.length === 0) return "_No nodes in constellation_";
  const lines = ["**Nodes:**", ""];
  for (const node of constellation.nodes) {
    lines.push(`- Node \`${node.nodeId}\` → Cluster \`${node.clusterId}\``);
  }
  if (constellation.edges.length > 0) {
    lines.push("", "**Edges:**", "");
    for (const edge of constellation.edges) {
      lines.push(
        `- \`${edge.fromNodeId}\` → \`${edge.toNodeId}\` (${edge.relationship})`,
      );
    }
  }
  return lines.join("\n");
}

export function formatPhasesMarkdown(phases: PathPhaseRef[]): string {
  if (phases.length === 0) return "_No phases defined_";
  const sorted = [...phases].sort((a, b) => a.ordinal - b.ordinal);
  return sorted
    .map(
      (p) =>
        `### Phase ${p.ordinal}: ${p.name}\n\n**Status:** ${p.status}\n\n**Objective:** ${p.objective}\n\n**Source Clusters:** ${p.sourceClusterIds.join(", ") || "_None_"}\n\n#### Tasks\n\n${
  p.tasks.length > 0
    ? p.tasks
        .map(
          (t) =>
            `- [ ] **${t.title}** — Acceptance: ${t.acceptance.join(", ") || "_None_"}`,
        )
        .join("\n")
    : "_No tasks_"
}`,
    )
    .join("\n\n---\n\n");
}

export function formatRisksMarkdown(risks: RiskEntryRef[]): string {
  if (risks.length === 0) return "_No risks identified_";
  const header = "| Risk | Phase | L | I | Mitigation | Status |";
  const sep = "|------|-------|---|---|------------|--------|";
  const rows = risks.map(
    (r) =>
      `| ${r.description.substring(0, 30)}... | ${r.phaseId.substring(0, 8)} | ${r.likelihood} | ${r.impact} | ${r.mitigation.substring(0, 15)}... | ${r.status} |`,
  );
  return [header, sep, ...rows].join("\n");
}

export function formatAutonomyMarkdown(
  autonomy: AutonomyConfigRef | null,
): string {
  if (!autonomy) return "_Autonomy not configured_";
  const lines = [
    `**Victor Mode:** ${autonomy.victorMode}`,
    "",
    "**Guardrails:**",
  ];
  if (autonomy.guardrails.length === 0) {
    lines.push("_No guardrails defined_");
  } else {
    for (const g of autonomy.guardrails) {
      lines.push(`- \`${g.enforcement}\`: ${g.rule}`);
    }
  }
  lines.push("", "**Approval Gates:**");
  if (autonomy.approvalGates.length === 0) {
    lines.push("_No approval gates_");
  } else {
    for (const g of autonomy.approvalGates) {
      lines.push(`- ${g.trigger} → ${g.approver} (${g.timeout}s timeout)`);
    }
  }
  lines.push("", "**Allowed Actions:**", autonomy.allowedActions.join(", ") || "_None_");
  lines.push("**Blocked Actions:**", autonomy.blockedActions.join(", ") || "_None_");
  return lines.join("\n");
}

export function formatAsMarkdown(
  project: QoreProject,
  state: FullProjectState,
): string {
  const lines = [
    `# Project: ${project.name}`,
    "",
    `_Exported: ${new Date().toISOString()}_`,
    "",
    project.description || "_No description_",
    "",
    "---",
    "",
    "## Captured Thoughts (Void)",
    "",
    formatThoughtsMarkdown(state.thoughts),
    "",
    "---",
    "",
    "## Organized Clusters (Reveal)",
    "",
    formatClustersMarkdown(state.clusters),
    "",
    "---",
    "",
    "## Relationships (Constellation)",
    "",
    formatConstellationMarkdown(state.constellation),
    "",
    "---",
    "",
    "## Execution Plan (Path)",
    "",
    formatPhasesMarkdown(state.phases),
    "",
    "---",
    "",
    "## Risk Register",
    "",
    formatRisksMarkdown(state.risks),
    "",
    "---",
    "",
    "## Autonomy Configuration",
    "",
    formatAutonomyMarkdown(state.autonomy),
  ];

  return lines.join("\n");
}

export function formatSingleViewMarkdown(
  view: string,
  data: unknown,
  project: QoreProject,
): string {
  const lines = [
    `# ${view.charAt(0).toUpperCase() + view.slice(1)}: ${project.name}`,
    "",
    `_Exported: ${new Date().toISOString()}_`,
    "",
  ];

  switch (view) {
    case "void":
      lines.push(formatThoughtsMarkdown((data as VoidThoughtRef[]) ?? []));
      break;
    case "reveal":
      lines.push(formatClustersMarkdown((data as RevealClusterRef[]) ?? []));
      break;
    case "constellation":
      lines.push(formatConstellationMarkdown(data as ConstellationMapRef | null));
      break;
    case "path":
      lines.push(formatPhasesMarkdown((data as PathPhaseRef[]) ?? []));
      break;
    case "risk":
      lines.push(formatRisksMarkdown((data as RiskEntryRef[]) ?? []));
      break;
    case "autonomy":
      lines.push(formatAutonomyMarkdown(data as AutonomyConfigRef | null));
      break;
    default:
      lines.push("Unknown view");
  }

  return lines.join("\n");
}

export async function loadAndFormatViewMarkdown(
  projectPath: string,
  view: string,
  data: unknown,
): Promise<string> {
  const projectJson = await readFile(join(projectPath, "project.json"), "utf8");
  const project: QoreProject = JSON.parse(projectJson);
  return formatSingleViewMarkdown(view, data, project);
}
