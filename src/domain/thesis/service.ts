import {
  createDomainEvent,
  type DomainEvent,
  ValidationError,
  type VersionHistoryRepository,
} from "@/domain/shared";

import {
  calculateOverallThesisStatus,
  type Thesis,
  type ThesisStatement,
  thesisStatementsUpdateSchema,
} from "./model";
import type { ThesisRepository } from "./repository";

export interface ThesisUpdatedPayload {
  companyId: string;
  thesisId: string;
  before: Thesis;
  after: Thesis;
  overallStatusChanged: boolean;
}

const THESIS_ENTITY_TYPE = "thesis";

/**
 * Business logic for the Thesis Engine. Framework-independent. The
 * overall status is always recalculated server-side from the statements
 * — never accepted as client input, so it can never drift out of sync
 * with the statements that determine it.
 */
export class ThesisService {
  constructor(
    private readonly repository: ThesisRepository,
    private readonly versionHistory: VersionHistoryRepository
  ) {}

  async getOrCreateThesis(ownerId: string, companyId: string): Promise<Thesis> {
    const existing = await this.repository.getByCompanyId(ownerId, companyId);
    if (existing) return existing;
    return this.repository.create(ownerId, companyId);
  }

  /** Batch read for multi-company views — never creates rows as a side effect. */
  async listByCompanyIds(ownerId: string, companyIds: string[]): Promise<Thesis[]> {
    return this.repository.listByCompanyIds(ownerId, companyIds);
  }

  async updateStatements(
    ownerId: string,
    companyId: string,
    input: unknown,
    actorId: string,
    correlationId: string
  ): Promise<{ thesis: Thesis; event: DomainEvent<ThesisUpdatedPayload> }> {
    const parsed = thesisStatementsUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid thesis statements",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const before = await this.getOrCreateThesis(ownerId, companyId);

    await this.versionHistory.recordVersion({
      ownerId,
      entityType: THESIS_ENTITY_TYPE,
      entityId: before.id,
      snapshot: before,
      changedBy: actorId,
    });

    // crypto.randomUUID() is a Web Crypto API global (available in Node,
    // browsers, and edge runtimes alike) — not a Node-specific import, so
    // using it here doesn't violate the domain layer's
    // no-framework-dependency rule (docs/domain-driven-design.md).
    const statementsWithIds: ThesisStatement[] = parsed.data.statements.map((statement) => ({
      ...statement,
      id: statement.id ?? crypto.randomUUID(),
    }));
    const overallStatus = calculateOverallThesisStatus(statementsWithIds);

    const after = await this.repository.setStatements(
      ownerId,
      before.id,
      statementsWithIds,
      overallStatus
    );

    const event = createDomainEvent<ThesisUpdatedPayload>({
      type: "ThesisUpdated",
      actorId,
      correlationId,
      payload: {
        companyId,
        thesisId: after.id,
        before,
        after,
        overallStatusChanged: before.overallStatus !== after.overallStatus,
      },
    });

    return { thesis: after, event };
  }
}
