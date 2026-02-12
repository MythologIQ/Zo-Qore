import * as crypto from "crypto";
import { DecisionRequest } from "@mythologiq/qore-contracts/schemas/DecisionTypes";
import { ZoAskRequest } from "@mythologiq/qore-contracts/schemas/ZoApiTypes";
import { classifyZoPromptAction } from "@mythologiq/qore-contracts/schemas/ActionClassification";

function extractPrompt(input: ZoAskRequest): string {
  if (typeof input.prompt === "string") return input.prompt;
  return "";
}

export function extractModelId(input: ZoAskRequest): string | undefined {
  return typeof input.model === "string" && input.model.length > 0 ? input.model : undefined;
}

export function toDecisionRequest(body: ZoAskRequest, actorId: string): DecisionRequest {
  const prompt = extractPrompt(body);
  const model = extractModelId(body) ?? "unknown";
  const contextHash = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        model,
        sessionId: body.sessionId ?? null,
        context: body.context ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 16);
  const requestId = `zoask_${crypto
    .createHash("sha256")
    .update(`${actorId}::${prompt}::${contextHash}`)
    .digest("hex")
    .slice(0, 24)}`;

  return {
    requestId,
    actorId,
    action: classifyZoPromptAction(prompt),
    targetPath: "zo/ask_prompt",
    content: prompt,
    context: {
      surface: "zo_http_api",
      model,
      sessionId: body.sessionId ?? "unknown",
      contextHash,
    },
  };
}

