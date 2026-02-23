import { RuntimeError, RuntimeErrorCode } from "../service/errors.js";

export type PlanningStoreErrorCode =
  | "PROJECT_NOT_FOUND"
  | "PROJECT_ALREADY_EXISTS"
  | "ARTIFACT_NOT_FOUND"
  | "ARTIFACTCorrupted"
  | "INTEGRITY_CHECK_FAILED"
  | "INVALID_PROJECT_DATA"
  | "INVALID_ARTIFACT_DATA"
  | "WRITE_FAILED"
  | "READ_FAILED"
  | "CHECKSUM_MISMATCH";

const errorMessages: Record<PlanningStoreErrorCode, string> = {
  PROJECT_NOT_FOUND: "Project not found",
  PROJECT_ALREADY_EXISTS: "Project already exists",
  ARTIFACT_NOT_FOUND: "Artifact not found",
  ARTIFACTCorrupted: "Artifact data is corrupted",
  INTEGRITY_CHECK_FAILED: "Store integrity check failed",
  INVALID_PROJECT_DATA: "Invalid project data",
  INVALID_ARTIFACT_DATA: "Invalid artifact data",
  WRITE_FAILED: "Failed to write data",
  READ_FAILED: "Failed to read data",
  CHECKSUM_MISMATCH: "Checksum mismatch detected",
};

export class PlanningStoreError extends RuntimeError {
  constructor(
    code: PlanningStoreErrorCode,
    message?: string,
    details?: Record<string, unknown>,
  ) {
    super(
      code as RuntimeErrorCode,
      message || errorMessages[code],
      details,
    );
    this.name = "PlanningStoreError";
  }
}