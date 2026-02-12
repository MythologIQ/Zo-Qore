export class ActorKeyring {
  private readonly keys = new Map<string, string>();

  constructor(entries?: Record<string, string>) {
    if (!entries) return;
    for (const [kid, secret] of Object.entries(entries)) {
      if (!kid || !secret) continue;
      this.keys.set(kid, secret);
    }
  }

  static fromEnv(serialized: string | undefined): ActorKeyring {
    if (!serialized) return new ActorKeyring();
    const entries: Record<string, string> = {};
    for (const pair of serialized.split(",")) {
      const trimmed = pair.trim();
      if (!trimmed) continue;
      const idx = trimmed.indexOf(":");
      if (idx <= 0 || idx >= trimmed.length - 1) continue;
      const kid = trimmed.slice(0, idx).trim();
      const secret = trimmed.slice(idx + 1).trim();
      if (kid && secret) {
        entries[kid] = secret;
      }
    }
    return new ActorKeyring(entries);
  }

  set(kid: string, secret: string): void {
    this.keys.set(kid, secret);
  }

  get(kid: string): string | undefined {
    return this.keys.get(kid);
  }

  delete(kid: string): void {
    this.keys.delete(kid);
  }

  entries(): Array<[string, string]> {
    return Array.from(this.keys.entries());
  }

  hasAny(): boolean {
    return this.keys.size > 0;
  }
}
