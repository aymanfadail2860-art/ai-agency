export type AppErrorCode =
  | "validation_error"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "integration_not_configured"
  | "integration_error"
  | "upstream_not_found"
  | "blocked_url"
  | "timeout"
  | "not_implemented"
  | "mode_mismatch"
  | "internal_error";

const STATUS: Record<AppErrorCode, number> = {
  validation_error: 400,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  integration_not_configured: 503,
  integration_error: 502,
  upstream_not_found: 404,
  blocked_url: 400,
  timeout: 504,
  not_implemented: 501,
  mode_mismatch: 409,
  internal_error: 500,
};

/** Fejltype med stabil kode, HTTP-status og brugervendt (dansk) besked. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
