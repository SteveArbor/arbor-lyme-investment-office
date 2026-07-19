import type { ResearchInput, ResearchNote, ResearchUpdate } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface ResearchRepository {
  getByCompanyId(ownerId: string, companyId: string): Promise<ResearchNote | null>;
  create(ownerId: string, input: ResearchInput): Promise<ResearchNote>;
  update(ownerId: string, researchId: string, patch: ResearchUpdate): Promise<ResearchNote>;
}
