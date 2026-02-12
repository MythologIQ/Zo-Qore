import * as crypto from "crypto";
import { QoreRuntimeService } from "../../runtime/service/QoreRuntimeService";
import { FallbackCommandRequest, FallbackCommandResult } from "./types";

export async function evaluateFallbackCommand(
  runtime: QoreRuntimeService,
  request: FallbackCommandRequest,
): Promise<FallbackCommandResult> {
  const decision = await runtime.evaluate({
    requestId: `fallback-${crypto.randomUUID()}`,
    actorId: request.actorId,
    action: "execute",
    targetPath: request.workingDirectory ?? "shell",
    content: request.command,
    context: {
      source: "fallback-wrapper",
    },
  });

  if (decision.decision === "ALLOW") {
    return {
      allowed: true,
      reason: "allowed_by_governance",
      decisionId: decision.decisionId,
      auditEventId: decision.auditEventId,
    };
  }

  return {
    allowed: false,
    reason: `blocked_${decision.decision.toLowerCase()}`,
    decisionId: decision.decisionId,
    auditEventId: decision.auditEventId,
    requiredActions: decision.requiredActions,
  };
}
