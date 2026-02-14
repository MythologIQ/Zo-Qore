/**
 * Autonomy Types
 *
 * Type definitions for autonomy readiness checks.
 *
 * @module zo/autonomy/types
 */

/** Readiness check result */
export interface ReadinessCheck {
  name: string;
  passed: boolean;
  reason: string;
  severity: "blocker" | "warning" | "info";
}

/** Overall readiness state */
export interface AutonomyReadiness {
  projectId: string;
  isReady: boolean;
  checks: ReadinessCheck[];
  blockerCount: number;
  warningCount: number;
}
