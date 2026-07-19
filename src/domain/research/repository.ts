import type { ResearchInput, ResearchNote, ResearchUpdate } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface ResearchRepository {
  getByCompanyId(ownerId: string, companyId: string): Promise<ResearchNote | null>;
  /**
   * Batch read for multi-company views (e.g. the Monitoring Dashboard) —
   * one query for every company instead of one per company (Phase 2
   * Architecture Review finding 4.5). Returns only existing rows; a
   * company with no research yet is simply absent, since this method
   * never creates a row as a side effect of being read.
   */
  listByCompanyIds(ownerId: string, companyIds: string[]): Promise<ResearchNote[]>;
  create(ownerId: string, input: ResearchInput): Promise<ResearchNote>;
  update(ownerId: string, researchId: string, patch: ResearchUpdate): Promise<ResearchNote>;
}
