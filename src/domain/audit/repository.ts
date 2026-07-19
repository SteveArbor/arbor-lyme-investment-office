import type { AuditRecord } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface AuditRepository {
  insert(record: AuditRecord): Promise<void>;
}
