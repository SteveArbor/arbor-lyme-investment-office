import { z } from "zod";

/**
 * Valuation is an independent domain (docs/development-roadmap.md Phase 2,
 * item 4) — generic across any company, nothing company-specific
 * hardcoded anywhere here. Every update is versioned (see
 * domain/shared/versioning.ts).
 */

export const valuationScenarioSchema = z.object({
  epsAssumption: z.number().describe("Projected earnings per share for this scenario"),
  growthRateAssumption: z.number().min(-1).max(5).describe("Annual growth rate, e.g. 0.15 = 15%"),
  terminalMultiple: z
    .number()
    .positive()
    .describe("P/E (or similar) multiple applied at the terminal year"),
  discountRate: z.number().min(0).max(1),
  probability: z
    .number()
    .min(0)
    .max(1)
    .describe("This scenario's weight in the blended fair value"),
});

export type ValuationScenarioInput = z.infer<typeof valuationScenarioSchema>;

export interface ValuationScenario extends ValuationScenarioInput {
  fairValue: number; // computed, never client-supplied — see calculateScenarioFairValue
}

export const valuationSchema = z
  .object({
    companyId: z.string().uuid(),
    projectionYears: z.number().int().min(1).max(30).default(5),
    requiredReturn: z.number().min(0).max(1),
    marginOfSafety: z
      .number()
      .min(0)
      .max(1)
      .describe("Required discount to fair value before buying"),
    bear: valuationScenarioSchema,
    base: valuationScenarioSchema,
    bull: valuationScenarioSchema,
  })
  .refine(
    (data) => {
      const total = data.bear.probability + data.base.probability + data.bull.probability;
      return Math.abs(total - 1) < 0.001;
    },
    {
      message: "Scenario probabilities (bear + base + bull) must sum to 1",
      path: ["bull", "probability"],
    }
  );

export type ValuationInput = z.infer<typeof valuationSchema>;

export interface Valuation {
  id: string;
  ownerId: string;
  companyId: string;
  projectionYears: number;
  requiredReturn: number;
  marginOfSafety: number;
  bear: ValuationScenario;
  base: ValuationScenario;
  bull: ValuationScenario;
  blendedFairValue: number; // computed, probability-weighted across scenarios
  createdAt: string;
  updatedAt: string;
}

// .partial() cannot be applied directly to a ZodEffects (the .refine()
// above), so the update schema re-validates the same probability-sum rule
// against the merged (before + patch) result at the service layer instead
// — see domain/valuation/service.ts.
export const valuationUpdateSchema = z.object({
  projectionYears: z.number().int().min(1).max(30).optional(),
  requiredReturn: z.number().min(0).max(1).optional(),
  marginOfSafety: z.number().min(0).max(1).optional(),
  bear: valuationScenarioSchema.optional(),
  base: valuationScenarioSchema.optional(),
  bull: valuationScenarioSchema.optional(),
});

export type ValuationUpdate = z.infer<typeof valuationUpdateSchema>;

/**
 * Single-stage, discounted-terminal-multiple fair value estimate:
 * project EPS forward at the scenario's growth rate, apply the terminal
 * multiple, discount back to present value. A deliberately simple,
 * transparent model — not a full multi-stage DCF — appropriate as the
 * Foundation-quality starting point; every input is explicit and stored,
 * so the calculation is fully auditable from the assumptions alone.
 */
export function calculateScenarioFairValue(
  scenario: ValuationScenarioInput,
  projectionYears: number
): number {
  const futureEps =
    scenario.epsAssumption * Math.pow(1 + scenario.growthRateAssumption, projectionYears);
  const futurePrice = futureEps * scenario.terminalMultiple;
  return futurePrice / Math.pow(1 + scenario.discountRate, projectionYears);
}

export function calculateBlendedFairValue(
  bear: ValuationScenario,
  base: ValuationScenario,
  bull: ValuationScenario
): number {
  return (
    bear.fairValue * bear.probability +
    base.fairValue * base.probability +
    bull.fairValue * bull.probability
  );
}

export const VALUATION_STATUS_OPTIONS = ["undervalued", "fairly_valued", "overvalued"] as const;

export type ValuationStatus = (typeof VALUATION_STATUS_OPTIONS)[number];

/**
 * Compares a current price against blended fair value and the required
 * margin of safety (used by the Monitoring Dashboard,
 * docs/development-roadmap.md Phase 2, item 9): undervalued only when the
 * discount to fair value meets or exceeds the required margin of safety,
 * overvalued once price exceeds fair value outright, fairly valued in
 * between.
 */
export function calculateValuationStatus(
  currentPrice: number,
  blendedFairValue: number,
  marginOfSafety: number
): ValuationStatus {
  if (blendedFairValue <= 0) return "overvalued";
  if (currentPrice > blendedFairValue) return "overvalued";
  const requiredPrice = blendedFairValue * (1 - marginOfSafety);
  if (currentPrice <= requiredPrice) return "undervalued";
  return "fairly_valued";
}
