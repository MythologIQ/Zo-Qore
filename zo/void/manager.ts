/**
 * Void Session Manager
 *
 * Manages void capture sessions and coordinates with genesis pipeline.
 *
 * @module zo/void/manager
 */

import type { DuckDBClient } from "../storage/duckdb-client.js";
import { ProjectTabStorage } from "../project-tab/storage.js";
import { GenesisPipeline } from "../genesis/pipeline.js";
import { VoidNegotiator } from "./negotiator.js";
import { VoidLocalStorage } from "./storage.js";
import type {
  VoidMode,
  VoidState,
  VoidConfig,
  VoidSessionState,
  VoidEvent,
  VoidEventHandler,
  NegotiationPrompt,
} from "./types.js";
import { DEFAULT_VOID_CONFIG } from "./types.js";

/**
 * Manages void capture sessions and coordinates with genesis pipeline.
 */
export class VoidManager {
  private readonly storage: ProjectTabStorage;
  private readonly pipeline: GenesisPipeline;
  private readonly localStorage: VoidLocalStorage;
  private negotiator: VoidNegotiator | null = null;

  private sessionId: string | null = null;
  private projectId: string | null = null;
  private mode: VoidMode = "genesis";
  private state: VoidState = "idle";
  private thoughtCount = 0;
  private activePrompt: NegotiationPrompt | null = null;
  private completenessScore = 0;
  private eventHandlers: VoidEventHandler[] = [];

  constructor(
    db: DuckDBClient,
    private readonly config: VoidConfig = DEFAULT_VOID_CONFIG
  ) {
    this.storage = new ProjectTabStorage(db);
    this.pipeline = new GenesisPipeline(db, {
      debounceMs: 500,
      clustering: { similarityThreshold: 0.75, minClusterSize: 2 },
    });
    this.localStorage = new VoidLocalStorage();

    this.setupPipelineEvents();
  }

  /**
   * Subscribe to void events.
   */
  onEvent(handler: VoidEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const idx = this.eventHandlers.indexOf(handler);
      if (idx >= 0) this.eventHandlers.splice(idx, 1);
    };
  }

  /**
   * Start a new void session or resume existing.
   */
  async startSession(projectId: string, mode: VoidMode = "genesis"): Promise<string> {
    // Check for existing session in localStorage
    const saved = this.localStorage.load();
    if (saved && saved.projectId === projectId) {
      return this.resumeSession(saved.sessionId, projectId, saved.mode);
    }

    return this.createNewSession(projectId, mode);
  }

  /**
   * Submit a thought to the void.
   */
  async submitThought(content: string): Promise<string> {
    if (!this.sessionId) {
      throw new Error("No active session");
    }

    const thought = await this.storage.createThought({
      id: crypto.randomUUID(),
      sessionId: this.sessionId,
      content,
    });

    this.thoughtCount++;
    this.negotiator?.recordThought(content);
    this.pipeline.queueThought(this.sessionId, thought.id);

    this.emit({ type: "thought_submitted", thoughtId: thought.id, content });
    this.persistState("");

    return thought.id;
  }

  /**
   * Dismiss the current negotiation prompt.
   */
  dismissPrompt(): void {
    if (this.activePrompt) {
      this.activePrompt.dismissed = true;
      this.activePrompt = null;
      this.emit({ type: "prompt_dismissed" });
    }
  }

  /**
   * Accept the reveal offer.
   */
  acceptReveal(): void {
    this.state = "revealing";
    this.emit({ type: "offer_accepted" });
  }

  /**
   * Decline the reveal offer and continue capturing.
   */
  declineOffer(): void {
    this.state = "capturing";
    this.negotiator?.handleOfferDeclined();
    this.emit({ type: "offer_declined" });
  }

  /**
   * Switch between genesis and living mode.
   */
  setMode(mode: VoidMode): void {
    this.mode = mode;
    this.emit({ type: "mode_changed", mode });
    this.persistState();
  }

  /**
   * Mark session as done.
   */
  endSession(): void {
    this.negotiator?.stop();
    this.negotiator = null;
    this.state = "idle";
    this.localStorage.clear();
    this.emit({ type: "session_done" });
  }

  /**
   * Get current session state.
   */
  getState(): VoidSessionState | null {
    if (!this.sessionId || !this.projectId) return null;

    return {
      sessionId: this.sessionId,
      projectId: this.projectId,
      mode: this.mode,
      state: this.state,
      thoughtCount: this.thoughtCount,
      lastActivityAt: new Date().toISOString(),
      activePrompt: this.activePrompt,
      completenessScore: this.completenessScore,
      readyForReveal: this.state === "offer_pending",
    };
  }

  /**
   * Get active session ID.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Setup pipeline event subscriptions.
   */
  private setupPipelineEvents(): void {
    this.pipeline.onEvent((event) => {
      if (event.type === "completeness_updated") {
        this.completenessScore = event.assessment.score;
        this.negotiator?.updateCompleteness(event.assessment.score);

        if (event.assessment.readyForReveal && this.state === "capturing") {
          this.state = "offer_pending";
        }
      }
    });
  }

  /**
   * Resume an existing session.
   */
  private resumeSession(
    sessionId: string,
    projectId: string,
    mode: VoidMode
  ): string {
    this.sessionId = sessionId;
    this.projectId = projectId;
    this.mode = mode;
    this.state = "capturing";
    this.startNegotiator();
    return sessionId;
  }

  /**
   * Create a new session.
   */
  private async createNewSession(projectId: string, mode: VoidMode): Promise<string> {
    const sessionId = crypto.randomUUID();

    await this.storage.createGenesisSession({
      id: sessionId,
      projectId,
      rawInput: "",
    });

    this.sessionId = sessionId;
    this.projectId = projectId;
    this.mode = mode;
    this.state = "capturing";
    this.thoughtCount = 0;
    this.completenessScore = 0;

    this.startNegotiator();
    this.persistState("");

    return sessionId;
  }

  /**
   * Start the negotiator with prompt callback.
   */
  private startNegotiator(): void {
    this.negotiator = new VoidNegotiator(this.config, (prompt) => {
      this.activePrompt = prompt;
      this.emit({ type: "prompt_shown", prompt });
    });
  }

  /**
   * Persist current state to localStorage.
   */
  private persistState(draftContent?: string): void {
    if (!this.sessionId || !this.projectId) return;

    this.localStorage.save({
      sessionId: this.sessionId,
      projectId: this.projectId,
      mode: this.mode,
      draftContent: draftContent ?? "",
      lastActivityAt: new Date().toISOString(),
    });
  }

  /**
   * Emit an event to all handlers.
   */
  private emit(event: VoidEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Swallow handler errors to prevent cascade
      }
    }
  }
}
