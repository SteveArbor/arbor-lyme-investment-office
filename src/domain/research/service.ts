import {
  createDomainEvent,
  type DomainEvent,
  ValidationError,
  type VersionHistoryRepository,
} from "@/domain/shared";

import { EMPTY_RESEARCH_SECTIONS, type ResearchNote, researchUpdateSchema } from "./model";
import type { ResearchRepository } from "./repository";

export interface ResearchUpdatedPayload {
  companyId: string;
  researchId: string;
  before: ResearchNote;
  after: ResearchNote;
  changedFields: string[];
}

const RESEARCH_ENTITY_TYPE = "research_note";

/**
 * Business logic for the Research aggregate. Framework-independent.
 * Every update is snapshotted to version history BEFORE being applied —
 * see docs/development-roadmap.md Phase 2, item 10 ("never overwrite
 * historical data").
 */
export class ResearchService {
  constructor(
    private readonly repository: ResearchRepository,
    private readonly versionHistory: VersionHistoryRepository
  ) {}

  /** A ResearchNote is created lazily, with empty sections, the first time it's needed. */
  async getOrCreateResearch(ownerId: string, companyId: string): Promise<ResearchNote> {
    const existing = await this.repository.getByCompanyId(ownerId, companyId);
    if (existing) return existing;
    return this.repository.create(ownerId, { companyId, ...EMPTY_RESEARCH_SECTIONS });
  }

  /** Batch read for multi-company views — never creates rows as a side effect. */
  async listResearchForCompanies(ownerId: string, companyIds: string[]): Promise<ResearchNote[]> {
    return this.repository.listByCompanyIds(ownerId, companyIds);
  }

  async updateResearch(
    ownerId: string,
    companyId: string,
    input: unknown,
    actorId: string,
    correlationId: string
  ): Promise<{ research: ResearchNote; event: DomainEvent<ResearchUpdatedPayload> }> {
    const parsed = researchUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid research update",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError("No fields provided to update", {});
    }

    const before = await this.getOrCreateResearch(ownerId, companyId);

    await this.versionHistory.recordVersion({
      ownerId,
      entityType: RESEARCH_ENTITY_TYPE,
      entityId: before.id,
      snapshot: before,
      changedBy: actorId,
    });

    const after = await this.repository.update(ownerId, before.id, parsed.data);
    const changedFields = Object.keys(parsed.data);

    const event = createDomainEvent<ResearchUpdatedPayload>({
      type: "ResearchUpdated",
      actorId,
      correlationId,
      payload: { companyId, researchId: after.id, before, after, changedFields },
    });

    return { research: after, event };
  }
}
