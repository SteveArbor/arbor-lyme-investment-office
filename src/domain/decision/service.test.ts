import { describe, expect, it } from "vitest";

import { ValidationError } from "@/domain/shared";

import type { DecisionRecommendation } from "./model";
import type { CreateRecommendationData, DecisionRepository } from "./repository";
import { DecisionService } from "./service";

let nextId = 1;

class FakeDecisionRepository implements DecisionRepository {
  public readonly rows: DecisionRecommendation[] = [];

  async create(ownerId: string, data: CreateRecommendationData): Promise<DecisionRecommendation> {
    const recommendation: DecisionRecommendation = {
      id: `decision-${nextId++}`,
      ownerId,
      ...data,
      generatedAt: new Date().toISOString(),
    };
    this.rows.push(recommendation);
    return recommendation;
  }

  async getLatestByCompanyId(
    ownerId: string,
    companyId: string
  ): Promise<DecisionRecommendation | null> {
    const matches = this.rows.filter(
      (row) => row.ownerId === ownerId && row.companyId === companyId
    );
    return matches.length ? matches[matches.length - 1] : null;
  }

  async listByCompanyId(ownerId: string, companyId: string): Promise<DecisionRecommendation[]> {
    return this.rows.filter((row) => row.ownerId === ownerId && row.companyId === companyId);
  }

  async listLatestByCompanyIds(
    ownerId: string,
    companyIds: string[]
  ): Promise<DecisionRecommendation[]> {
    const latestByCompany = new Map<string, DecisionRecommendation>();
    for (const row of this.rows) {
      if (row.ownerId === ownerId && companyIds.includes(row.companyId)) {
        latestByCompany.set(row.companyId, row);
      }
    }
    return [...latestByCompany.values()];
  }
}

const validInputs = {
  companyId: "11111111-1111-4111-8111-111111111111",
  businessQuality: 0.9,
  economicMoat: 0.85,
  financialStrength: 0.8,
  capitalAllocation: 0.75,
  growth: 0.7,
  riskLevel: 0.2,
  expectedReturn: 0.2,
  marginOfSafety: 0.3,
};

describe("DecisionService", () => {
  it("generates a rating, never places a trade, and always uses deterministic_rules as the source", async () => {
    const service = new DecisionService(new FakeDecisionRepository());

    const result = await service.generateRating("user-1", validInputs, "user-1", "corr-1");

    expect(result.recommendation.rating).toBeDefined();
    expect(result.recommendation.conclusionSource).toBe("deterministic_rules");
    expect(result.event.type).toBe("OpportunityGenerated");
    // No method on this service (or anywhere in the domain) executes a
    // trade — asserted structurally by the absence of any such API, not
    // by a runtime check.
  });

  it("high-quality, attractively-valued inputs produce a strong positive rating", async () => {
    const service = new DecisionService(new FakeDecisionRepository());

    const result = await service.generateRating(
      "user-1",
      {
        ...validInputs,
        businessQuality: 1,
        economicMoat: 1,
        financialStrength: 1,
        riskLevel: 0,
        expectedReturn: 0.3,
        marginOfSafety: 0.5,
      },
      "user-1",
      "corr-1"
    );

    expect(["exceptional", "strong_buy"]).toContain(result.recommendation.rating);
  });

  it("poor-quality, unattractive inputs produce a negative rating", async () => {
    const service = new DecisionService(new FakeDecisionRepository());

    const result = await service.generateRating(
      "user-1",
      {
        companyId: validInputs.companyId,
        businessQuality: 0.1,
        economicMoat: 0.1,
        financialStrength: 0.1,
        capitalAllocation: 0.1,
        growth: 0.1,
        riskLevel: 0.9,
        expectedReturn: -0.05,
        marginOfSafety: 0,
      },
      "user-1",
      "corr-1"
    );

    expect(["sell", "avoid"]).toContain(result.recommendation.rating);
  });

  it("returns the most recent recommendation as the latest rating", async () => {
    const service = new DecisionService(new FakeDecisionRepository());
    await service.generateRating("user-1", validInputs, "user-1", "corr-1");
    const second = await service.generateRating("user-1", validInputs, "user-1", "corr-2");

    const latest = await service.getLatestRating("user-1", validInputs.companyId);
    expect(latest?.id).toBe(second.recommendation.id);
  });

  it("preserves the full rating history rather than overwriting it", async () => {
    const service = new DecisionService(new FakeDecisionRepository());
    await service.generateRating("user-1", validInputs, "user-1", "corr-1");
    await service.generateRating("user-1", validInputs, "user-1", "corr-2");

    const history = await service.getRatingHistory("user-1", validInputs.companyId);
    expect(history).toHaveLength(2);
  });

  it("rejects an out-of-range quality input", async () => {
    const service = new DecisionService(new FakeDecisionRepository());

    await expect(
      service.generateRating("user-1", { ...validInputs, businessQuality: 1.5 }, "user-1", "corr-1")
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
