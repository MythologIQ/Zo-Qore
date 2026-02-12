import { LedgerManager } from "../../ledger/engine/LedgerManager";
import { QoreRuntimeService } from "../../runtime/service/QoreRuntimeService";
import { FallbackWatcher, FallbackWatcherOptions } from "./watcher";
import { FallbackWatcherEvent } from "./types";

export interface FallbackPipelineOptions extends Omit<FallbackWatcherOptions, "onEvent"> {
  privilegedPathPrefixes?: string[];
}

export class FallbackGovernancePipeline {
  private watcher: FallbackWatcher | undefined;
  private readonly privilegedPathPrefixes: string[];

  constructor(
    private readonly runtime: QoreRuntimeService,
    private readonly ledger: LedgerManager,
    private readonly options: FallbackPipelineOptions,
  ) {
    this.privilegedPathPrefixes = options.privilegedPathPrefixes ?? [
      "/etc",
      "/usr",
      "/bin",
      "/sbin",
      "/root",
      "/var/lib",
    ];
  }

  start(): void {
    if (this.watcher) return;
    this.watcher = new FallbackWatcher({
      actorId: this.options.actorId,
      rootPath: this.options.rootPath,
      onEvent: (event) => {
        void this.processEvent(event);
      },
    });
    this.watcher.start();
  }

  stop(): void {
    this.watcher?.stop();
    this.watcher = undefined;
  }

  async processEvent(event: FallbackWatcherEvent): Promise<{ allowed: boolean; privileged: boolean }> {
    const privileged = this.isPrivilegedPath(event.path);
    const decision = await this.runtime.evaluate({
      requestId: `fallback-watch-${event.eventId}`,
      actorId: event.actorId,
      action: "write",
      targetPath: event.path,
      context: {
        source: "fallback-watcher",
        operation: event.operation,
        privileged,
      },
    });

    const allowed = decision.decision === "ALLOW";
    const shouldFailClosed = privileged || decision.decision !== "ALLOW";
    await this.ledger.appendEntry({
      eventType: shouldFailClosed ? "AUDIT_FAIL" : "AUDIT_PASS",
      agentDid: event.actorId,
      artifactPath: event.path,
      riskGrade: decision.riskGrade,
      payload: {
        eventId: event.eventId,
        operation: event.operation,
        privileged,
        decision: decision.decision,
        decisionId: decision.decisionId,
        auditEventId: decision.auditEventId,
      },
    });

    return { allowed: !shouldFailClosed && allowed, privileged };
  }

  private isPrivilegedPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    return this.privilegedPathPrefixes.some((prefix) =>
      normalized.startsWith(prefix.toLowerCase()),
    );
  }
}
