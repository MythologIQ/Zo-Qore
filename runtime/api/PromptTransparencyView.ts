export interface PromptTransparencyView {
  stage: "PROMPT_BUILD_STARTED" | "PROMPT_BUILD_COMPLETED" | "PROMPT_DISPATCHED" | "PROMPT_DISPATCH_BLOCKED";
  surface: "zo_http_api" | "zo_mcp";
  actorId: string;
  model: string;
  target: string;
  contentLength: number;
  promptFingerprint: string;
  profile: string;
  traceId?: string;
  reason?: string;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function toPromptTransparencyView(payload: Record<string, unknown>): PromptTransparencyView | undefined {
  if (payload.type !== "prompt_transparency") return undefined;
  const stage = asString(payload.stage);
  const surface = asString(payload.surface);
  const actorId = asString(payload.actorId);
  const model = asString(payload.model);
  const target = asString(payload.target);
  const contentLength = asNumber(payload.contentLength);
  const promptFingerprint = asString(payload.promptFingerprint);
  const profile = asString(payload.profile);
  if (!stage || !surface || !actorId || !model || !target || contentLength === undefined || !promptFingerprint || !profile) {
    return undefined;
  }
  return {
    stage: stage as PromptTransparencyView["stage"],
    surface: surface as PromptTransparencyView["surface"],
    actorId,
    model,
    target,
    contentLength,
    promptFingerprint,
    profile,
    traceId: asString(payload.traceId),
    reason: asString(payload.reason),
  };
}
