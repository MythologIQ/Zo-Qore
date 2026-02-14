/**
 * Reveal Module
 *
 * Public exports for the reveal transition from genesis to organized view.
 *
 * @module zo/reveal
 */

export type {
  RevealState,
  RevealCluster,
  RevealThought,
  RevealViewState,
  RevealEvent,
  RevealEventHandler,
} from "./types.js";

export { RevealService } from "./service.js";
export { layoutClusters, type LayoutConfig } from "./layout.js";
