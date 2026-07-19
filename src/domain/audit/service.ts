import { logger } from "@/lib/logger";

import { type AuditRecordInput, sanitizeAuditMetadata } from "./model";
import type { AuditRepository } from "./repository";

/**
 * Records audit events. Framework-independent (no Next.js, no Supabase) —
 * testable with a plain in-memory AuditRepository.
 *
 * Deliberately fail-open: a failure writing an audit record must never
 * break the primary user action it's observing (explicit Foundation
 * requirement, docs/audit-strategy.md). The failure is still surfaced via
 * the structured logger, never silently swallowed — "fail-open" means the
 * user's action succeeds, not that the failure goes unnoticed.
 */
export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  async record(input: AuditRecordInput): Promise<void> {
    try {
      await this.repository.insert({
        actorId: input.actorId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        correlationId: input.correlationId ?? null,
        metadata: sanitizeAuditMetadata(input.metadata ?? {}),
        source: input.source ?? "app",
        outcome: input.outcome,
        occurredAt: new Date().toISOString(),
      });
    } catch (error) {
      logger.error("Failed to write audit event", {
        category: "audit",
        eventType: input.eventType,
        entityType: input.entityType,
        correlationId: input.correlationId ?? undefined,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
