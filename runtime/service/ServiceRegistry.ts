/**
 * Service Registry for External Zo Services
 * 
 * Manages registration and discovery of external services that integrate
 * with Zo-Qore runtime (e.g., victor-tts, embedding services, etc.)
 */

import * as fs from "fs";
import * as path from "path";

export interface ServiceEndpoint {
  [key: string]: string;
}

export interface ServiceDefinition {
  name: string;
  description: string;
  url: string;
  enabled: boolean;
  endpoints: ServiceEndpoint;
  capabilities: string[];
}

export interface ServicesConfig {
  version: string;
  services: Record<string, ServiceDefinition>;
}

/**
 * Registry for managing external service integrations.
 */
export class ServiceRegistry {
  private services: Map<string, ServiceDefinition> = new Map();
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? path.join(
      process.cwd(),
      "runtime",
      "config",
      "services.json"
    );
  }

  /**
   * Load service definitions from configuration file.
   */
  async loadServices(): Promise<void> {
    if (!fs.existsSync(this.configPath)) {
      console.warn(`Service registry config not found: ${this.configPath}`);
      return;
    }

    try {
      const configData = fs.readFileSync(this.configPath, "utf-8");
      const config: ServicesConfig = JSON.parse(configData);

      for (const [serviceId, definition] of Object.entries(config.services)) {
        if (definition.enabled) {
          this.services.set(serviceId, definition);
          console.log(`Registered service: ${serviceId} (${definition.name})`);
        }
      }
    } catch (error) {
      console.error(`Failed to load service registry: ${error}`);
      throw error;
    }
  }

  /**
   * Get a service definition by ID.
   */
  getService(serviceId: string): ServiceDefinition | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Get full URL for a service endpoint.
   */
  getEndpointUrl(serviceId: string, endpoint: string): string | null {
    const service = this.services.get(serviceId);
    if (!service) return null;

    const endpointPath = service.endpoints[endpoint];
    if (!endpointPath) return null;

    return `${service.url}${endpointPath}`;
  }

  /**
   * Find services by capability.
   */
  findByCapability(capability: string): ServiceDefinition[] {
    return Array.from(this.services.values()).filter(
      (service) => service.capabilities.includes(capability)
    );
  }

  /**
   * Check if a service is available and healthy.
   */
  async checkHealth(serviceId: string): Promise<boolean> {
    const healthUrl = this.getEndpointUrl(serviceId, "health");
    if (!healthUrl) return false;

    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get all registered services.
   */
  getAllServices(): Map<string, ServiceDefinition> {
    return new Map(this.services);
  }
}
