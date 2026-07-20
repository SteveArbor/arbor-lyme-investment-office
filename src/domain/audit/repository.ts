import type { AuditRecord } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface AuditRepository {
  insert(record: AuditRecord): Promise<void>;
  /** Newest first. Backs an entity's "audit history" (e.g. a transaction detail view). */
  listByEntity(actorId: string, entityType: string, entityId: string): Promise<AuditRecord[]>;
}
