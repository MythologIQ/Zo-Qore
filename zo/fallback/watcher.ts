import * as fs from "fs";
import * as path from "path";
import { FallbackWatcherEvent } from "./types";

export interface FallbackWatcherOptions {
  actorId: string;
  rootPath: string;
  onEvent: (event: FallbackWatcherEvent) => void;
}

export class FallbackWatcher {
  private watcher: fs.FSWatcher | undefined;
  private eventCounter = 0;

  constructor(private readonly options: FallbackWatcherOptions) {}

  start(): void {
    if (this.watcher) return;
    this.watcher = fs.watch(this.options.rootPath, { recursive: true }, (_eventType, filename) => {
      if (!filename) return;
      this.eventCounter += 1;
      const fullPath = path.join(this.options.rootPath, filename.toString());
      const exists = fs.existsSync(fullPath);
      this.options.onEvent({
        eventId: `fallback_evt_${this.eventCounter}`,
        actorId: this.options.actorId,
        path: fullPath,
        operation: exists ? "modify" : "delete",
        timestamp: new Date().toISOString(),
      });
    });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = undefined;
  }
}
