import * as crypto from "crypto";
import { DecisionRequest } from "@mythologiq/qore-contracts/schemas/DecisionTypes";
import { McpRequest } from "@mythologiq/qore-contracts/schemas/McpTypes";
import { classifyToolAction } from "@mythologiq/qore-contracts/schemas/ActionClassification";

function extractTargetPath(method: string, params: unknown): string {
  if (!params || typeof params !== "object") return method;
  const obj = params as Record<string, unknown>;
  const args = (obj.arguments as Record<string, unknown> | undefined) ?? obj;
  const candidates = [
    args.path,
    args.file,
    args.targetPath,
    args.resource,
    args.uri,
    args.name,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return method;
}

function extractContent(params: unknown): string | undefined {
  if (!params || typeof params !== "object") return undefined;
  const obj = params as Record<string, unknown>;
  const args = (obj.arguments as Record<string, unknown> | undefined) ?? obj;
  const value = args.content ?? args.text ?? args.body ?? args.patch;
  return typeof value === "string" ? value : undefined;
}

function actionSource(method: string, params: unknown): string {
  if (method === "tools/call" && params && typeof params === "object") {
    const name = (params as Record<string, unknown>).name;
    if (typeof name === "string" && name.length > 0) return name;
  }
  return method;
}

export function extractMcpModelId(request: McpRequest): string | undefined {
  if (!request.params || typeof request.params !== "object") return undefined;
  const params = request.params as Record<string, unknown>;
  const args = (params.arguments as Record<string, unknown> | undefined) ?? params;
  const model = args.model ?? params.model;
  return typeof model === "string" && model.length > 0 ? model : undefined;
}

export function toDecisionRequest(request: McpRequest, actorId: string): DecisionRequest {
  const methodSource = actionSource(request.method, request.params);
  const toolName =
    request.method === "tools/call" && request.params && typeof request.params === "object"
      ? (request.params as Record<string, unknown>).name
      : undefined;
  const action = classifyToolAction(
    request.method,
    typeof toolName === "string" ? toolName : undefined,
  );
  const targetPath = extractTargetPath(methodSource, request.params);
  const content = extractContent(request.params);
  const paramsHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(request.params ?? null))
    .digest("hex")
    .slice(0, 16);
  const requestIdSource = `${String(request.id ?? "null")}::${request.method}::${actorId}::${paramsHash}`;
  const requestId = `mcp_${crypto.createHash("sha256").update(requestIdSource).digest("hex").slice(0, 24)}`;
  const model = extractMcpModelId(request) ?? "unknown";

  return {
    requestId,
    actorId,
    action,
    targetPath,
    content,
    context: {
      mcpMethod: request.method,
      mcpId: request.id ?? null,
      toolSource: methodSource,
      model,
    },
  };
}

export function isReadOnlyMcpRequest(
  request: McpRequest,
  readOnlyTools: ReadonlySet<string>,
): boolean {
  if (request.method === "tools/list" || request.method === "resources/list" || request.method === "prompts/list") {
    return true;
  }
  if (request.method !== "tools/call") return false;
  if (!request.params || typeof request.params !== "object") return false;
  const toolName = (request.params as Record<string, unknown>).name;
  return typeof toolName === "string" && readOnlyTools.has(toolName);
}

