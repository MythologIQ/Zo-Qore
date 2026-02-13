export type RuntimeErrorCode =
  | "NOT_INITIALIZED"
  | "POLICY_INVALID"
  | "EVALUATION_FAILED"
  | "AUTH_REQUIRED"
  | "PAYLOAD_TOO_LARGE"
  | "REPLAY_CONFLICT"
  | "MODEL_REQUIRED"
  | "MODEL_NOT_ALLOWED"
  | "RATE_LIMIT_EXCEEDED";

export class RuntimeError extends Error {
  constructor(
    public readonly code: RuntimeErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}
