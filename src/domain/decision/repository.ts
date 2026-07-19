import type {
  ConclusionSource,
  DecisionInputs,
  DecisionRecommendation,
  InvestmentRating,
} from "./model";

export interface CreateRecommendationData {
  companyId: string;
  inputs: Omit<DecisionInputs, "companyId">;
  qualityScore: number;
  valuationScore: number;
  overallScore: number;
  conviction: number;
  rating: InvestmentRating;
  conclusionSource: ConclusionSource;
}

/**
 * Interface only — implemented in infrastructure/database.
 * DecisionRecommendations are append-only (each rating run creates a new,
 * immutable record — never mutated): "the current rating" is simply the
 * most recent one, and the full history is always available for review.
 */
export interface DecisionRepository {
  create(ownerId: string, data: CreateRecommendationData): Promise<DecisionRecommendation>;
  getLatestByCompanyId(ownerId: string, companyId: string): Promise<DecisionRecommendation | null>;
  listByCompanyId(ownerId: string, companyId: string): Promise<DecisionRecommendation[]>;
  /**
   * Batch read for multi-company views: one row per company (the most
   * recent rating), not the full history — one query instead of one
   * getLatestByCompanyId call per company.
   */
  listLatestByCompanyIds(ownerId: string, companyIds: string[]): Promise<DecisionRecommendation[]>;
}
