import { createDomainEvent, type DomainEvent, ValidationError } from "@/domain/shared";

import {
  calculateConviction,
  calculateInvestmentRating,
  calculateOverallScore,
  calculateQualityScore,
  calculateValuationScore,
  decisionInputsSchema,
  type DecisionRecommendation,
} from "./model";
import type { DecisionRepository } from "./repository";

export interface OpportunityGeneratedPayload {
  companyId: string;
  recommendationId: string;
  rating: string;
  overallScore: number;
}

/**
 * The Decision Engine. Framework-independent, deterministic, and never
 * portfolio-aware (docs/decision-engine.md, ADR 0023). AI-assisted
 * synthesis (conclusionSource: "ai_analysis"/"combined") is a Phase 4
 * concern (docs/development-roadmap.md) — this implementation always
 * produces "deterministic_rules" ratings, which is itself the correct,
 * honest value for what's actually computing the result right now.
 */
export class DecisionService {
  constructor(private readonly repository: DecisionRepository) {}

  async generateRating(
    ownerId: string,
    input: unknown,
    actorId: string,
    correlationId: string
  ): Promise<{
    recommendation: DecisionRecommendation;
    event: DomainEvent<OpportunityGeneratedPayload>;
  }> {
    const parsed = decisionInputsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid decision inputs",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const { companyId, ...inputs } = parsed.data;

    const qualityScore = calculateQualityScore(inputs);
    const valuationScore = calculateValuationScore(inputs);
    const overallScore = calculateOverallScore(qualityScore, valuationScore);
    const conviction = calculateConviction(qualityScore);
    const rating = calculateInvestmentRating(overallScore);

    const recommendation = await this.repository.create(ownerId, {
      companyId,
      inputs,
      qualityScore,
      valuationScore,
      overallScore,
      conviction,
      rating,
      conclusionSource: "deterministic_rules",
    });

    const event = createDomainEvent<OpportunityGeneratedPayload>({
      type: "OpportunityGenerated",
      actorId,
      correlationId,
      payload: {
        companyId,
        recommendationId: recommendation.id,
        rating: recommendation.rating,
        overallScore: recommendation.overallScore,
      },
    });

    return { recommendation, event };
  }

  async getLatestRating(
    ownerId: string,
    companyId: string
  ): Promise<DecisionRecommendation | null> {
    return this.repository.getLatestByCompanyId(ownerId, companyId);
  }

  async getRatingHistory(ownerId: string, companyId: string): Promise<DecisionRecommendation[]> {
    return this.repository.listByCompanyId(ownerId, companyId);
  }
}
