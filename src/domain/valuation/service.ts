import {
  createDomainEvent,
  type DomainEvent,
  ValidationError,
  type VersionHistoryRepository,
} from "@/domain/shared";

import {
  calculateBlendedFairValue,
  calculateScenarioFairValue,
  type Valuation,
  type ValuationScenario,
  type ValuationScenarioInput,
  valuationUpdateSchema,
} from "./model";
import type { ValuationRepository, ValuationWriteData } from "./repository";

export interface ValuationUpdatedPayload {
  companyId: string;
  valuationId: string;
  before: Valuation;
  after: Valuation;
  changedFields: string[];
}

const VALUATION_ENTITY_TYPE = "valuation";

// Neutral, non-company-specific starting assumptions
// ("Do NOT hardcode NVIDIA. Everything must support any company." —
// docs/development-roadmap.md Phase 2, item 4).
const DEFAULT_SCENARIO: ValuationScenarioInput = {
  epsAssumption: 0,
  growthRateAssumption: 0,
  terminalMultiple: 15,
  discountRate: 0.1,
  probability: 1 / 3,
};

function withFairValue(
  scenario: ValuationScenarioInput,
  projectionYears: number
): ValuationScenario {
  return { ...scenario, fairValue: calculateScenarioFairValue(scenario, projectionYears) };
}

function toWriteData(input: {
  projectionYears: number;
  requiredReturn: number;
  marginOfSafety: number;
  bear: ValuationScenarioInput;
  base: ValuationScenarioInput;
  bull: ValuationScenarioInput;
}): ValuationWriteData {
  const bear = withFairValue(input.bear, input.projectionYears);
  const base = withFairValue(input.base, input.projectionYears);
  const bull = withFairValue(input.bull, input.projectionYears);

  return {
    projectionYears: input.projectionYears,
    requiredReturn: input.requiredReturn,
    marginOfSafety: input.marginOfSafety,
    bear,
    base,
    bull,
    blendedFairValue: calculateBlendedFairValue(bear, base, bull),
  };
}

/**
 * Business logic for the Valuation aggregate. Framework-independent.
 * `fairValue`/`blendedFairValue` are always recalculated server-side from
 * the stored assumptions — never accepted as client input, so they can
 * never drift out of sync with the assumptions that determine them.
 */
export class ValuationService {
  constructor(
    private readonly repository: ValuationRepository,
    private readonly versionHistory: VersionHistoryRepository
  ) {}

  async getOrCreateValuation(ownerId: string, companyId: string): Promise<Valuation> {
    const existing = await this.repository.getByCompanyId(ownerId, companyId);
    if (existing) return existing;

    const data = toWriteData({
      projectionYears: 5,
      requiredReturn: 0.1,
      marginOfSafety: 0.25,
      bear: DEFAULT_SCENARIO,
      base: DEFAULT_SCENARIO,
      bull: DEFAULT_SCENARIO,
    });
    return this.repository.create(ownerId, companyId, data);
  }

  /** Batch read for multi-company views — never creates rows as a side effect. */
  async listByCompanyIds(ownerId: string, companyIds: string[]): Promise<Valuation[]> {
    return this.repository.listByCompanyIds(ownerId, companyIds);
  }

  async updateValuation(
    ownerId: string,
    companyId: string,
    input: unknown,
    actorId: string,
    correlationId: string
  ): Promise<{ valuation: Valuation; event: DomainEvent<ValuationUpdatedPayload> }> {
    const parsed = valuationUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid valuation update",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError("No fields provided to update", {});
    }

    const before = await this.getOrCreateValuation(ownerId, companyId);

    const merged = {
      projectionYears: parsed.data.projectionYears ?? before.projectionYears,
      requiredReturn: parsed.data.requiredReturn ?? before.requiredReturn,
      marginOfSafety: parsed.data.marginOfSafety ?? before.marginOfSafety,
      bear: parsed.data.bear ?? before.bear,
      base: parsed.data.base ?? before.base,
      bull: parsed.data.bull ?? before.bull,
    };

    const totalProbability =
      merged.bear.probability + merged.base.probability + merged.bull.probability;
    if (Math.abs(totalProbability - 1) >= 0.001) {
      throw new ValidationError("Scenario probabilities (bear + base + bull) must sum to 1", {
        probability: ["Scenario probabilities must sum to 1"],
      });
    }

    await this.versionHistory.recordVersion({
      ownerId,
      entityType: VALUATION_ENTITY_TYPE,
      entityId: before.id,
      snapshot: before,
      changedBy: actorId,
    });

    const writeData = toWriteData(merged);
    const after = await this.repository.update(ownerId, before.id, writeData);
    const changedFields = Object.keys(parsed.data);

    const event = createDomainEvent<ValuationUpdatedPayload>({
      type: "ValuationUpdated",
      actorId,
      correlationId,
      payload: { companyId, valuationId: after.id, before, after, changedFields },
    });

    return { valuation: after, event };
  }
}
