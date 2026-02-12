import * as path from "path";
import { RuntimeStateStore, SecretStore, WorkspaceProvider } from "@mythologiq/qore-contracts/runtime/interfaces";

export class InMemoryStateStore implements RuntimeStateStore {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string, fallback: T): T {
    if (!this.values.has(key)) return fallback;
    return this.values.get(key) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }
}

export class InMemorySecretStore implements SecretStore {
  private readonly values = new Map<string, string>();

  async getSecret(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

export class StaticWorkspaceProvider implements WorkspaceProvider {
  constructor(private readonly root: string) {}

  getWorkspaceRoot(): string | undefined {
    return this.root;
  }

  resolvePath(...segments: string[]): string {
    return path.join(this.root, ...segments);
  }
}

