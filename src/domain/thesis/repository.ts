import type { Thesis, ThesisStatement } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface ThesisRepository {
  getByCompanyId(ownerId: string, companyId: string): Promise<Thesis | null>;
  /** Batch read for multi-company views — never creates a row as a side effect. */
  listByCompanyIds(ownerId: string, companyIds: string[]): Promise<Thesis[]>;
  create(ownerId: string, companyId: string): Promise<Thesis>;
  /** Replaces the full statement list and recorded overallStatus atomically. */
  setStatements(
    ownerId: string,
    thesisId: string,
    statements: ThesisStatement[],
    overallStatus: Thesis["overallStatus"]
  ): Promise<Thesis>;
}
