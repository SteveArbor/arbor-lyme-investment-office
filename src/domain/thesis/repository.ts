import type { Thesis, ThesisStatement } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface ThesisRepository {
  getByCompanyId(ownerId: string, companyId: string): Promise<Thesis | null>;
  create(ownerId: string, companyId: string): Promise<Thesis>;
  /** Replaces the full statement list and recorded overallStatus atomically. */
  setStatements(
    ownerId: string,
    thesisId: string,
    statements: ThesisStatement[],
    overallStatus: Thesis["overallStatus"]
  ): Promise<Thesis>;
}
