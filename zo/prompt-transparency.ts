import * as crypto from "crypto";

export type PromptTransparencyStage =
  | "PROMPT_BUILD_STARTED"
  | "PROMPT_BUILD_COMPLETED"
  | "PROMPT_DISPATCHED"
  | "PROMPT_DISPATCH_BLOCKED";

export interface PromptTransparencyEvent {
  stage: PromptTransparencyStage;
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

function fingerprint(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

export function createPromptTransparencyEvent(input: {
  stage: PromptTransparencyStage;
  surface: "zo_http_api" | "zo_mcp";
  actorId: string;
  model: string;
  target: string;
  content: string;
  profile?: string;
  traceId?: string;
  reason?: string;
}): PromptTransparencyEvent {
  return {
    stage: input.stage,
    surface: input.surface,
    actorId: input.actorId,
    model: input.model,
    target: input.target,
    contentLength: input.content.length,
    promptFingerprint: fingerprint(input.content),
    profile: input.profile ?? "default",
    traceId: input.traceId,
    reason: input.reason,
  };
}

export function logPromptTransparency(event: PromptTransparencyEvent): void {
  const reason = event.reason ? ` reason=${event.reason}` : "";
  const trace = event.traceId ? ` traceId=${event.traceId}` : "";
  console.info(
    `[qore][prompt] ${event.stage} surface=${event.surface} model=${event.model} actor=${event.actorId} target=${event.target} len=${event.contentLength} fp=${event.promptFingerprint}${trace}${reason}`,
  );
}
