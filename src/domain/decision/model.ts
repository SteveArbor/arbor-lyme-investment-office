import { z } from "zod";

/**
 * The Decision Engine (docs/decision-engine.md, ADR 0023). Produces an
 * InvestmentRating only — never portfolio-aware, never places a trade.
 * Every calculation here is deterministic and pure; nothing about a
 * specific company is hardcoded (docs/development-roadmap.md Phase 2).
 */

export const INVESTMENT_RATING_OPTIONS = [
  "exceptional",
  "strong_buy",
  "buy",
  "hold",
  "reduce_conviction",
  "sell",
  "avoid",
] as const;

export type InvestmentRating = (typeof INVESTMENT_RATING_OPTIONS)[number];

export const CONCLUSION_SOURCE_OPTIONS = [
  "deterministic_rules",
  "ai_analysis",
  "manual_judgement",
  "combined",
] as const;

export type ConclusionSource = (typeof CONCLUSION_SOURCE_OPTIONS)[number];

export const decisionInputsSchema = z.object({
  companyId: z.string().uuid(),
  businessQuality: z.number().min(0).max(1),
  economicMoat: z.number().min(0).max(1),
  financialStrength: z.number().min(0).max(1),
  capitalAllocation: z.number().min(0).max(1),
  growth: z.number().min(0).max(1),
  riskLevel: z.number().min(0).max(1).describe("Higher = riskier"),
  expectedReturn: z.number().describe("Annualised expected return, e.g. 0.15 = 15%"),
  marginOfSafety: z.number().describe("Discount to fair value achieved, e.g. 0.30 = 30%"),
});

export type DecisionInputs = z.infer<typeof decisionInputsSchema>;

export interface DecisionRecommendation {
  id: string;
  ownerId: string;
  companyId: string;
  inputs: Omit<DecisionInputs, "companyId">;
  qualityScore: number; // 0–1, business-quality conviction, independent of price/timing
  valuationScore: number; // 0–1, how attractive expected return + margin of safety are right now
  overallScore: number; // 0–1, blended — the score the rating is derived from
  conviction: number; // 0–1 — currently equal to qualityScore; see calculateConviction
  rating: InvestmentRating;
  conclusionSource: ConclusionSource;
  generatedAt: string;
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/**
 * Business-quality score: an equal-weighted average of the six quality
 * dimensions, with risk inverted (higher risk lowers the score). Equal
 * weighting is a deliberate, documented starting point — not a claim that
 * every dimension matters equally in every case — and is the first thing
 * to make configurable if real usage shows a need
 * (docs/adr/0023-investment-rating-vs-portfolio-action.md's future review
 * criteria).
 */
export function calculateQualityScore(inputs: Omit<DecisionInputs, "companyId">): number {
  const riskAdjusted = 1 - inputs.riskLevel;
  return (
    (inputs.businessQuality +
      inputs.economicMoat +
      inputs.financialStrength +
      inputs.capitalAllocation +
      inputs.growth +
      riskAdjusted) /
    6
  );
}

/**
 * Valuation attractiveness score: expected return and margin of safety
 * each normalised against a generous-but-bounded reference range (0–30%
 * expected return, 0–50% margin of safety), then averaged. Values outside
 * the range clamp to 0 or 1 rather than extrapolating.
 */
export function calculateValuationScore(inputs: Omit<DecisionInputs, "companyId">): number {
  const returnScore = normalize(inputs.expectedReturn, 0, 0.3);
  const marginScore = normalize(inputs.marginOfSafety, 0, 0.5);
  return (returnScore + marginScore) / 2;
}

/**
 * Overall Investment Score: quality-weighted more heavily (60%) than
 * current valuation attractiveness (40%) — reflecting that business
 * quality is the more durable signal, while valuation affects timing.
 */
export function calculateOverallScore(qualityScore: number, valuationScore: number): number {
  return qualityScore * 0.6 + valuationScore * 0.4;
}

/**
 * Conviction is intentionally distinct from the Overall Score: it is
 * "how much we believe in the business" (quality alone), independent of
 * whether the current price offers an attractive entry. A high-conviction
 * business can still carry a Hold/Reduce Conviction rating if the
 * valuation isn't attractive right now.
 */
export function calculateConviction(qualityScore: number): number {
  return qualityScore;
}

/**
 * Deterministic mapping from Overall Investment Score to InvestmentRating.
 * Thresholds are a documented starting point (docs/development-roadmap.md
 * Phase 2, item 5's "future review criteria" — ADR 0023) — evaluated
 * against real usage before being tuned further, not adjusted
 * speculatively now.
 */
export function calculateInvestmentRating(overallScore: number): InvestmentRating {
  if (overallScore >= 0.85) return "exceptional";
  if (overallScore >= 0.7) return "strong_buy";
  if (overallScore >= 0.55) return "buy";
  if (overallScore >= 0.4) return "hold";
  if (overallScore >= 0.25) return "reduce_conviction";
  if (overallScore >= 0.1) return "sell";
  return "avoid";
}
