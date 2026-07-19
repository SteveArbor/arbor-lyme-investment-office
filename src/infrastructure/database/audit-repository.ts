import type { SupabaseClient } from "@supabase/supabase-js";

import type { AuditRecord, AuditRepository } from "@/domain/audit";
import type { Database } from "@/types/database";

/**
 * Supabase implementation of domain/audit's AuditRepository. Relies on the
 * audit_events table's RLS policies (insert-own-only) and revoked
 * update/delete privileges (supabase/migrations) for its safety guarantees
 * — this class does not re-implement them.
 *
 * Uses the caller's authenticated (anon-key + session) client, never a
 * service-role client — every Foundation audit event is actor-initiated,
 * so the insert-own-only RLS policy is exactly the access this needs (see
 * docs/implementation/foundation.md for why no service-role client exists
 * in this milestone).
 */
export class SupabaseAuditRepository implements AuditRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async insert(record: AuditRecord): Promise<void> {
    const { error } = await this.client.from("audit_events").insert({
      actor_id: record.actorId,
      event_type: record.eventType,
      entity_type: record.entityType,
      entity_id: record.entityId,
      correlation_id: record.correlationId,
      metadata: record.metadata,
      source: record.source,
      outcome: record.outcome,
    });

    if (error) throw error;
  }
}
