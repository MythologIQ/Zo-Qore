export interface FallbackCommandRequest {
  actorId: string;
  command: string;
  workingDirectory?: string;
}

export interface FallbackCommandResult {
  allowed: boolean;
  reason: string;
  decisionId?: string;
  auditEventId?: string;
  requiredActions?: string[];
}

export interface FallbackWatcherEvent {
  eventId: string;
  actorId: string;
  path: string;
  operation: "create" | "modify" | "delete";
  timestamp: string;
}
