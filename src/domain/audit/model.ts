/**
 * See docs/audit-strategy.md for the full design. This module defines the
 * record shape and the metadata sanitizer — the one place the "must never
 * contain" list (passwords, auth tokens, API keys, full session data, raw
 * financial documents, sensitive env values) is enforced, rather than
 * trusted to every call site individually.
 */

export type AuditSource = "app" | "system";
export type AuditOutcome = "success" | "failure";

export interface AuditRecordInput {
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  correlationId?: string | null;
  metadata?: Record<string, unknown>;
  source?: AuditSource;
  outcome: AuditOutcome;
}

export interface AuditRecord {
  actorId: string | null;
  eventType: string;
  entityType: string;
  entityId: string | null;
  correlationId: string | null;
  metadata: Record<string, unknown>;
  source: AuditSource;
  outcome: AuditOutcome;
  occurredAt: string;
}

/**
 * Deny-list, not allow-list, deliberately: docs/audit-strategy.md names
 * specific categories that must never appear (passwords, tokens, API
 * keys, session data). A key whose name matches one of these patterns is
 * stripped from the metadata object entirely, recursively — never merely
 * masked, since a mask can still leak structure/length.
 */
export const AUDIT_SENSITIVE_KEY_PATTERN =
  /password|token|secret|api[-_]?key|authorization|cookie|session/i;

/**
 * Recurses into arrays too, not just plain objects — a sensitive key
 * nested inside an array element (e.g. `{ items: [{ sessionToken: "..." }] }`)
 * previously passed through unsanitized because arrays were excluded from
 * the recursive branch entirely (docs/implementation/staff-engineer-review.md
 * finding H3). Every value reachable from `metadata` is now visited.
 */
function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value !== null && typeof value === "object") {
    return sanitizeAuditMetadata(value as Record<string, unknown>);
  }
  return value;
}

export function sanitizeAuditMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (AUDIT_SENSITIVE_KEY_PATTERN.test(key)) {
      continue;
    }

    result[key] = sanitizeValue(value);
  }

  return result;
}
