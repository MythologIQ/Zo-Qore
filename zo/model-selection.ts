export type ZoModelSelectionMode = "manual" | "suggest" | "auto";

export interface ZoModelCatalogEntry {
  id: string;
  capabilities: string[];
  maxInputTokens: number;
  maxOutputTokens: number;
  inputCostPer1kUsd: number;
  outputCostPer1kUsd: number;
}

export interface ZoModelSelectionResult {
  selectedModel: string;
  recommendedModel: string;
  mode: ZoModelSelectionMode;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedCostUsd: number;
  recommendedCostUsd: number;
  baselineModel: string;
  baselineCostUsd: number;
  costSavedUsd: number;
  costSavedPercent: number;
  tokenUtilizationPercent: number;
  rationale: string;
  warning?: string;
}

const AUTO_MODE_WARNING =
  "Auto model selection is best-effort. This open-source project provides no warranty. Operator is responsible for validation and cost outcomes.";

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}

function inferCapabilities(content: string): string[] {
  const lowered = content.toLowerCase();
  const caps = new Set<string>(["general"]);
  if (/\b(code|refactor|typescript|python|rust|debug|compile)\b/.test(lowered)) caps.add("coding");
  if (/\b(plan|architecture|threat|adversarial|governance|policy)\b/.test(lowered)) caps.add("reasoning");
  if (/\b(summarize|extract|format|rewrite|translate)\b/.test(lowered)) caps.add("fast");
  return [...caps];
}

function estimateOutputTokens(inputTokens: number, caps: string[]): number {
  if (caps.includes("reasoning")) return Math.max(200, Math.ceil(inputTokens * 0.75));
  if (caps.includes("coding")) return Math.max(300, Math.ceil(inputTokens * 1.2));
  return Math.max(120, Math.ceil(inputTokens * 0.5));
}

function parseCatalogEnv(raw: string | undefined): ZoModelCatalogEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is ZoModelCatalogEntry => {
      if (!item || typeof item !== "object") return false;
      const obj = item as Record<string, unknown>;
      return (
        typeof obj.id === "string" &&
        Array.isArray(obj.capabilities) &&
        typeof obj.maxInputTokens === "number" &&
        typeof obj.maxOutputTokens === "number" &&
        typeof obj.inputCostPer1kUsd === "number" &&
        typeof obj.outputCostPer1kUsd === "number"
      );
    });
  } catch {
    return [];
  }
}

export function resolveCatalog(
  catalogOverride?: ZoModelCatalogEntry[],
  envCatalogRaw: string | undefined = process.env.QORE_ZO_MODEL_CATALOG_JSON,
): ZoModelCatalogEntry[] {
  if (catalogOverride && catalogOverride.length > 0) return catalogOverride;
  return parseCatalogEnv(envCatalogRaw);
}

function estimateModelCost(
  model: ZoModelCatalogEntry,
  inputTokens: number,
  outputTokens: number,
): number {
  return (inputTokens / 1000) * model.inputCostPer1kUsd + (outputTokens / 1000) * model.outputCostPer1kUsd;
}

function scoreModel(
  model: ZoModelCatalogEntry,
  requiredCaps: string[],
  inputTokens: number,
  outputTokens: number,
): { score: number; estimatedCost: number } {
  const capHits = requiredCaps.filter((cap) => model.capabilities.includes(cap)).length;
  const capabilityScore = capHits / Math.max(1, requiredCaps.length);
  const fitsInput = model.maxInputTokens >= inputTokens ? 1 : 0;
  const fitsOutput = model.maxOutputTokens >= outputTokens ? 1 : 0;
  const estimatedCost = estimateModelCost(model, inputTokens, outputTokens);
  const costScore = 1 / Math.max(estimatedCost, 0.0001);
  const score = capabilityScore * 0.6 + fitsInput * 0.2 + fitsOutput * 0.1 + Math.min(costScore / 10, 0.1);
  return { score, estimatedCost };
}

function resolveBaselineModel(
  catalog: ZoModelCatalogEntry[],
  inputTokens: number,
  outputTokens: number,
  requiredCaps: string[],
  baselineModelId: string | undefined,
): ZoModelCatalogEntry {
  if (baselineModelId) {
    const exact = catalog.find((model) => model.id === baselineModelId);
    if (exact) return exact;
  }
  const compatible = catalog.filter((model) => {
    const hasAnyRequired = requiredCaps.some((cap) => model.capabilities.includes(cap));
    return hasAnyRequired && model.maxInputTokens >= inputTokens && model.maxOutputTokens >= outputTokens;
  });
  const pool = compatible.length > 0 ? compatible : catalog;
  return (
    pool.sort((a, b) => estimateModelCost(b, inputTokens, outputTokens) - estimateModelCost(a, inputTokens, outputTokens))[0] ??
    catalog[0]
  );
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

export function recommendModel(input: {
  content: string;
  mode: ZoModelSelectionMode;
  currentModel?: string;
  catalog: ZoModelCatalogEntry[];
  baselineModelId?: string;
}): ZoModelSelectionResult | undefined {
  const { content, mode, currentModel, catalog, baselineModelId } = input;
  if (catalog.length === 0) return undefined;
  const inputTokens = estimateTokens(content);
  const requiredCaps = inferCapabilities(content);
  const outputTokens = estimateOutputTokens(inputTokens, requiredCaps);

  const ranked = catalog
    .map((model) => {
      const { score, estimatedCost } = scoreModel(model, requiredCaps, inputTokens, outputTokens);
      return { model, score, estimatedCost };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return undefined;

  const recommendedModel = best.model.id;
  const selectedModel = mode === "suggest" && currentModel ? currentModel : recommendedModel;
  const selectedModelEntry = catalog.find((model) => model.id === selectedModel) ?? best.model;
  const selectedModelCost = estimateModelCost(selectedModelEntry, inputTokens, outputTokens);
  const baselineModel = resolveBaselineModel(catalog, inputTokens, outputTokens, requiredCaps, baselineModelId);
  const baselineCost = estimateModelCost(baselineModel, inputTokens, outputTokens);
  const costSavedUsd = Math.max(0, baselineCost - selectedModelCost);
  const costSavedPercent = baselineCost > 0 ? clampPercent((costSavedUsd / baselineCost) * 100) : 0;
  const tokenUtilizationPercent = clampPercent(
    ((inputTokens + outputTokens) / Math.max(1, selectedModelEntry.maxInputTokens + selectedModelEntry.maxOutputTokens)) *
      100,
  );
  const warning = mode === "auto" ? AUTO_MODE_WARNING : undefined;
  const rationale = `Recommended ${recommendedModel} for capabilities [${requiredCaps.join(
    ",",
  )}] with estimated cost $${best.estimatedCost.toFixed(4)} and projected savings $${costSavedUsd.toFixed(4)} versus ${
    baselineModel.id
  }.`;

  return {
    selectedModel,
    recommendedModel,
    mode,
    estimatedInputTokens: inputTokens,
    estimatedOutputTokens: outputTokens,
    estimatedCostUsd: selectedModelCost,
    recommendedCostUsd: best.estimatedCost,
    baselineModel: baselineModel.id,
    baselineCostUsd: baselineCost,
    costSavedUsd,
    costSavedPercent,
    tokenUtilizationPercent,
    rationale,
    warning,
  };
}
