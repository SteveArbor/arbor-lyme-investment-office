import type { InvestmentRating } from "@/domain/decision";

/**
 * Opportunities panel (Phase 4). Ranks using data this platform already
 * has — allocation drift, Investment Rating, recent quote movement, spare
 * cash — deliberately not a valuation model (none exists yet). Every
 * heuristic here is a documented placeholder, explicit about being one,
 * per the brief's own "manual placeholder scoring is acceptable until
 * valuation models exist."
 */
export const OPPORTUNITY_TYPES = [
  "highest_conviction",
  "largest_underweight",
  "largest_relative_discount",
  "recent_performer",
  "cash_deployment",
] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

export interface OpportunityHoldingInput {
  companyId: string;
  companyName: string;
  ticker: string;
  investmentRating: InvestmentRating | null;
  allocationPercent: number;
  targetAllocationPercent: number;
  /** Signed — negative means underweight vs. target (`HoldingPerformance.allocationDifferencePercent`). */
  allocationDifferencePercent: number;
  dailyChangePercent: number | null;
}

export interface Opportunity {
  type: OpportunityType;
  companyId: string | null;
  companyName: string | null;
  headline: string;
  detail: string;
}

const RATING_RANK: Record<InvestmentRating, number> = {
  exceptional: 6,
  strong_buy: 5,
  buy: 4,
  hold: 3,
  reduce_conviction: 2,
  sell: 1,
  avoid: 0,
};

/** Cash above this fraction of total portfolio value is surfaced as available for deployment — the same midpoint `domain/portfolio/health.ts` treats as the top of its ideal cash range. */
const CASH_DEPLOYMENT_THRESHOLD = 0.15;

function formatPoints(fraction: number): string {
  return `${(Math.abs(fraction) * 100).toFixed(1)}pp`;
}

/**
 * Returns at most one opportunity per `OpportunityType` — the caller
 * decides how many to display. Each type is independently optional (a
 * portfolio with no underweight holdings simply produces no
 * `largest_underweight` entry, never a fabricated one).
 */
export function identifyOpportunities(
  holdings: OpportunityHoldingInput[],
  cash: number,
  totalPortfolioValue: number
): Opportunity[] {
  const opportunities: Opportunity[] = [];

  const ratedUnderweight = holdings.filter(
    (h) => h.investmentRating !== null && h.allocationDifferencePercent < 0
  );
  if (ratedUnderweight.length > 0) {
    const best = ratedUnderweight.reduce((leader, candidate) =>
      RATING_RANK[candidate.investmentRating!] > RATING_RANK[leader.investmentRating!]
        ? candidate
        : leader
    );
    opportunities.push({
      type: "highest_conviction",
      companyId: best.companyId,
      companyName: best.companyName,
      headline: `${best.companyName} (${best.ticker})`,
      detail: `Rated ${best.investmentRating!.replace("_", " ")}, ${formatPoints(best.allocationDifferencePercent)} below target allocation.`,
    });
  }

  const underweights = holdings.filter((h) => h.allocationDifferencePercent < 0);
  if (underweights.length > 0) {
    const largest = underweights.reduce((leader, candidate) =>
      candidate.allocationDifferencePercent < leader.allocationDifferencePercent
        ? candidate
        : leader
    );
    opportunities.push({
      type: "largest_underweight",
      companyId: largest.companyId,
      companyName: largest.companyName,
      headline: `${largest.companyName} (${largest.ticker})`,
      detail: `${formatPoints(largest.allocationDifferencePercent)} below its ${(largest.targetAllocationPercent * 100).toFixed(1)}% target allocation.`,
    });
  }

  const belowTarget = holdings.filter(
    (h) => h.targetAllocationPercent > 0 && h.allocationPercent < h.targetAllocationPercent
  );
  if (belowTarget.length > 0) {
    const largest = belowTarget.reduce((leader, candidate) => {
      const candidateRatio = candidate.allocationPercent / candidate.targetAllocationPercent;
      const leaderRatio = leader.allocationPercent / leader.targetAllocationPercent;
      return candidateRatio < leaderRatio ? candidate : leader;
    });
    const ratio = largest.allocationPercent / largest.targetAllocationPercent;
    opportunities.push({
      type: "largest_relative_discount",
      companyId: largest.companyId,
      companyName: largest.companyName,
      headline: `${largest.companyName} (${largest.ticker})`,
      detail: `Sitting at ${(ratio * 100).toFixed(0)}% of its target allocation.`,
    });
  }

  const withDailyChange = holdings.filter((h) => h.dailyChangePercent !== null);
  if (withDailyChange.length > 0) {
    const best = withDailyChange.reduce((leader, candidate) =>
      candidate.dailyChangePercent! > leader.dailyChangePercent! ? candidate : leader
    );
    opportunities.push({
      type: "recent_performer",
      companyId: best.companyId,
      companyName: best.companyName,
      headline: `${best.companyName} (${best.ticker})`,
      detail: `${best.dailyChangePercent! >= 0 ? "+" : ""}${(best.dailyChangePercent! * 100).toFixed(1)}% today.`,
    });
  }

  const cashPercent = totalPortfolioValue > 0 ? cash / totalPortfolioValue : 0;
  if (cashPercent > CASH_DEPLOYMENT_THRESHOLD) {
    opportunities.push({
      type: "cash_deployment",
      companyId: null,
      companyName: null,
      headline: `Cash available for deployment`,
      detail: `Cash is ${(cashPercent * 100).toFixed(1)}% of the portfolio, above the ${(CASH_DEPLOYMENT_THRESHOLD * 100).toFixed(0)}% guideline.`,
    });
  }

  return opportunities;
}
