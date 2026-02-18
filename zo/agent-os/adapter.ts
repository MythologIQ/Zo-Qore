/**
 * Agent OS Adapter for Zo-Qore
 *
 * Bridges Zo-Qore's policy engine with Agent OS's agent lifecycle management.
 * Provides a TypeScript-native interface to Agent OS MCP server capabilities.
 */

// @ts-ignore - agentos-mcp-server types not published yet
// Temporarily commented out until agentos-mcp-server is available
// import { AgentOSMCPServer } from "agentos-mcp-server";
class AgentOSMCPServer {
  constructor(config: any) {
    // Stub implementation
  }
}

type ServerConfig = {
  policyMode: "strict" | "permissive";
  dataDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
};

type ServiceContext = any;
import * as path from "path";
import * as os from "os";

export interface AgentOSAdapterConfig {
  policyMode?: "strict" | "permissive";
  dataDir?: string;
  logLevel?: "debug" | "info" | "warn" | "error";
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  policies: string[];
  trustLevel?: "low" | "medium" | "high";
}

export interface AgentStatus {
  id: string;
  state: "created" | "deployed" | "active" | "suspended" | "terminated";
  uptime?: number;
  lastActivity?: string;
  policyViolations: number;
}

/**
 * Adapter for integrating Agent OS into Zo-Qore runtime.
 *
 * Provides:
 * - Agent lifecycle management (create, deploy, status)
 * - Policy attachment and compliance checking
 * - Audit trail integration
 */
export class AgentOSAdapter {
  private server: AgentOSMCPServer;
  private config: ServerConfig;

  constructor(config: AgentOSAdapterConfig = {}) {
    this.config = {
      policyMode: config.policyMode ?? "strict",
      dataDir: config.dataDir ?? path.join(os.homedir(), ".zo-qore", "agent-os"),
      logLevel: config.logLevel ?? "info",
    };

    this.server = new AgentOSMCPServer(this.config);
  }

  /**
   * Create a new agent with specified capabilities and policies.
   */
  async createAgent(definition: AgentDefinition): Promise<{ success: boolean; agentId: string; message: string }> {
    // Agent OS doesn't expose direct API - we use internal server context
    // In production, this would call Agent OS's create_agent tool via MCP
    const context = (this.server as any).context as ServiceContext;

    try {
      const agent = await context.agentManager.createAgent({
        name: definition.name,
        description: definition.description,
        capabilities: definition.capabilities,
        trustLevel: definition.trustLevel ?? "medium",
      });

      // Attach policies
      for (const policyId of definition.policies) {
        await context.policyEngine.attachPolicy(agent.id, policyId);
      }

      await context.auditLogger.log({
        action: "agent:created",
        agentId: agent.id,
        outcome: "SUCCESS",
        metadata: { definition },
      });

      return {
        success: true,
        agentId: agent.id,
        message: `Agent ${definition.name} created successfully`,
      };
    } catch (error) {
      await context.auditLogger.log({
        action: "agent:created",
        agentId: definition.id,
        outcome: "FAILURE",
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: { definition },
      });

      return {
        success: false,
        agentId: definition.id,
        message: `Failed to create agent: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get current status of an agent.
   */
  async getAgentStatus(agentId: string): Promise<AgentStatus | null> {
    const context = (this.server as any).context as ServiceContext;

    try {
      const agent = await context.agentManager.getAgent(agentId);
      if (!agent) return null;

      return {
        id: agent.id,
        state: agent.state,
        uptime: agent.uptime,
        lastActivity: agent.lastActivity,
        policyViolations: agent.policyViolations ?? 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if an agent's action would violate policy.
   */
  async checkCompliance(agentId: string, action: string, context: Record<string, unknown>): Promise<{
    allowed: boolean;
    violations: string[];
    recommendation?: string;
  }> {
    const serverContext = (this.server as any).context as ServiceContext;

    try {
      const result = await serverContext.policyEngine.checkCompliance(agentId, {
        action,
        context,
      });

      return {
        allowed: result.allowed,
        violations: result.violations ?? [],
        recommendation: result.recommendation,
      };
    } catch (error) {
      return {
        allowed: false,
        violations: [`Compliance check failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Get audit trail for an agent.
   */
  async getAuditTrail(agentId: string, limit = 50): Promise<Array<{
    timestamp: string;
    action: string;
    outcome: string;
    metadata?: Record<string, unknown>;
  }>> {
    const context = (this.server as any).context as ServiceContext;

    try {
      const logs = await context.auditLogger.getAgentLogs(agentId, limit);
      return logs.map((log: any) => ({
        timestamp: log.timestamp,
        action: log.action,
        outcome: log.outcome,
        metadata: log.metadata,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Shutdown the Agent OS adapter.
   */
  async shutdown(): Promise<void> {
    // Agent OS server doesn't expose shutdown method
    // In production, this would gracefully stop the MCP server
  }
}
