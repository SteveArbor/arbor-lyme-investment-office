import type { InvestmentRating } from "@/domain/decision";
import type { ThesisStatementStatus } from "@/domain/thesis";

/**
 * Phase 4's Allocation Analysis panel recommendation (deterministic —
 * "Use rules, not AI"). `watch` deliberately overrides a pure drift-based
 * read: a position whose thesis has broken or whose rating says
 * sell/avoid needs attention regardless of whether it happens to sit
 * close to its target allocation right now — drift alone can't see that.
 */
export const ALLOCATION_ACTION_OPTIONS = ["increase", "reduce", "hold", "watch"] as const;
export type AllocationAction = (typeof ALLOCATION_ACTION_OPTIONS)[number];

/** Allocation drift within this band (percentage points, as a 0–1 fraction) is treated as on-target — a starting threshold (see ADR), not tuned against real usage yet. */
export const ALLOCATION_DRIFT_TOLERANCE = 0.03;

/**
 * `differencePercent` is `HoldingPerformance.allocationDifferencePercent`
 * (signed: positive = overweight vs. target, negative = underweight).
 * `thesisStatus`/`investmentRating` are `null` when no thesis/rating has
 * ever been recorded for this holding — absence is never treated as a
 * red flag on its own (a genuinely new position may simply not have one
 * yet); only an actively broken thesis or a sell/avoid rating triggers
 * `watch`.
 */
export function calculateAllocationAction(
  differencePercent: number,
  thesisStatus: ThesisStatementStatus | null,
  investmentRating: InvestmentRating | null
): AllocationAction {
  if (thesisStatus === "broken" || investmentRating === "sell" || investmentRating === "avoid") {
    return "watch";
  }
  if (differencePercent > ALLOCATION_DRIFT_TOLERANCE) return "reduce";
  if (differencePercent < -ALLOCATION_DRIFT_TOLERANCE) return "increase";
  return "hold";
}
