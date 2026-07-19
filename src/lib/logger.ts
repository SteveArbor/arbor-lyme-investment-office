/**
 * Structured logging abstraction. No dependency on a commercial logging
 * provider (docs/engineering-standards.md) — this writes to stdout/stderr
 * in a shape that's readable in development and machine-parseable
 * (single-line JSON) in production, where a log drain (Vercel's built-in
 * logs, or a future provider — see "Observability" below) can pick it up.
 *
 * Callers are responsible for not passing Confidential/Highly Confidential
 * values (docs/data-classification.md) into `context` — this module has no
 * way to know which fields are sensitive for an arbitrary call site, so it
 * enforces shape and level, not content. Call sites that log domain
 * events (e.g., the audit subscriber) apply their own allow-list sanitizing
 * before calling this logger — see docs/audit-strategy.md.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  category?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  const isDevelopment = process.env.NODE_ENV !== "production";

  if (isDevelopment) {
    console[level === "debug" ? "log" : level](
      `[${entry.timestamp}] ${level.toUpperCase()} ${message}`,
      context ?? ""
    );
    return;
  }

  // Single-line JSON in production — safe and simple for a log drain to
  // ingest without a commercial provider's SDK (docs/engineering-standards.md).
  console[level === "debug" ? "log" : level](JSON.stringify(entry));
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
