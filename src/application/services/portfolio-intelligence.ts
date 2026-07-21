import type { Company } from "@/domain/company";
import { deriveCountryFromExchange } from "@/domain/company";
import { type AllocationAction, calculateAllocationAction } from "@/domain/portfolio";
import {
  calculateConcentrationWarnings,
  calculateCountryAllocation,
  calculateCurrencyExposure,
  calculatePortfolioHealth,
  calculateSectorAllocation,
  type ConcentrationWarning,
  type ExposureBreakdown,
  generatePortfolioInsights,
  identifyOpportunities,
  type Opportunity,
  type OpportunityHoldingInput,
  type PortfolioHealthResult,
  type PortfolioInsight,
  type RiskHoldingInput,
} from "@/domain/portfolio";

import type { CompanyMonitoringSummary } from "./monitoring";
import type { PortfolioValuation } from "./portfolio-valuation";

/** A small, named reference list of sectors worth flagging if a portfolio has zero exposure to them — a policy choice this composer makes explicitly, not a fact `domain/portfolio/insights.ts` invents (see that module's own doc comment on `watchedSectorsForGaps`). */
const WATCHED_SECTORS_FOR_GAPS = ["Healthcare", "Financials", "Energy"];

/** The ideal upper bound of cash as a fraction of total portfolio value — shared with `domain/portfolio/health.ts`'s own cash-target band so the Health score and the Insights panel never disagree about what "too much cash" means. */
const CASH_TARGET_PERCENT = 0.15;

export interface AllocationRow {
  companyId: string;
  companyName: string;
  ticker: string;
  currentPercent: number;
  targetPercent: number;
  differencePercent: number;
  action: AllocationAction;
}

export interface PortfolioIntelligence {
  health: PortfolioHealthResult;
  sectorAllocation: ExposureBreakdown[];
  countryAllocation: ExposureBreakdown[];
  currencyExposure: ExposureBreakdown[];
  concentrationWarnings: ConcentrationWarning[];
  opportunities: Opportunity[];
  insights: PortfolioInsight[];
  allocationRows: AllocationRow[];
  totalValue: number;
  cash: number;
}

/**
 * Assembles Phase 4's Investment Intelligence panels (Portfolio Health,
 * Risk Overview, Opportunities, Insights, Allocation Analysis) from data
 * already computed by `buildPortfolioValuation` (ADR 0032) and
 * `buildCompanyMonitoringSnapshots` (ADR 0024) — this composer never
 * fetches anything itself, matching every other composer in this
 * codebase.
 *
 * Accepts one or more `PortfolioValuation`s so the Dashboard can show a
 * combined view across every portfolio, or the Portfolio page a single
 * one. **Known limitation, disclosed** (see the Phase 4 ADR): when
 * combining more than one portfolio, holdings are not deduplicated by
 * company — if the same company is held in two portfolios, "largest
 * single position" and portfolio drift undercount that company's true
 * combined exposure. Sector/country/currency totals are unaffected (they
 * sum correctly either way). Selecting a single portfolio (the common
 * case) never hits this.
 */
export function buildPortfolioIntelligence(
  valuations: PortfolioValuation[],
  companies: Company[],
  snapshots: Map<string, CompanyMonitoringSummary>
): PortfolioIntelligence {
  const companyById = new Map(companies.map((company) => [company.id, company]));
  const holdings = valuations.flatMap((v) => v.holdings);
  const totalValue = valuations.reduce((sum, v) => sum + v.performance.totalValue, 0);
  const cash = valuations.reduce((sum, v) => sum + v.performance.cash, 0);
  const baseCurrency = valuations[0]?.baseCurrency ?? "GBP";

  const riskHoldings: RiskHoldingInput[] = holdings.map((h) => {
    const company = companyById.get(h.companyId);
    return {
      companyId: h.companyId,
      companyName: h.companyName,
      sector: company?.sector ?? "Unknown",
      country: company ? deriveCountryFromExchange(company.exchange) : "Unknown",
      currency: h.currency,
      marketValueBase: h.performance.marketValue,
    };
  });

  const sectorAllocation = calculateSectorAllocation(riskHoldings, totalValue);
  const countryAllocation = calculateCountryAllocation(riskHoldings, totalValue);
  const currencyExposure = calculateCurrencyExposure(riskHoldings, cash, baseCurrency, totalValue);

  const combinedAllocationPercent = new Map<string, number>(
    holdings.map((h) => [h.companyId, totalValue > 0 ? h.performance.marketValue / totalValue : 0])
  );
  const positionBreakdown = holdings.map((h) => ({
    companyName: h.companyName,
    percent: combinedAllocationPercent.get(h.companyId) ?? 0,
  }));
  const concentrationWarnings = calculateConcentrationWarnings(
    positionBreakdown,
    sectorAllocation,
    countryAllocation,
    currencyExposure
  );

  const fundValue = holdings
    .filter((h) => h.securityType === "fund")
    .reduce((sum, h) => sum + h.performance.marketValue, 0);
  const withTarget = holdings.filter((h) => h.targetAllocationPercent > 0);
  const averageAbsoluteDriftPercent =
    withTarget.length > 0
      ? withTarget.reduce(
          (sum, h) =>
            sum +
            Math.abs((combinedAllocationPercent.get(h.companyId) ?? 0) - h.targetAllocationPercent),
          0
        ) / withTarget.length
      : 0;
  const missingResearchCount = holdings.filter((h) => {
    const snapshot = snapshots.get(h.companyId);
    return h.investmentRating === null && !snapshot?.thesisStatus;
  }).length;
  const largestPositionPercent = holdings.reduce(
    (max, h) => Math.max(max, combinedAllocationPercent.get(h.companyId) ?? 0),
    0
  );

  const health = calculatePortfolioHealth({
    cashPercent: totalValue > 0 ? cash / totalValue : 0,
    holdingCount: holdings.length,
    largestPositionPercent,
    largestSectorPercent: sectorAllocation[0]?.percent ?? 0,
    largestCountryPercent: countryAllocation[0]?.percent ?? 0,
    averageAbsoluteDriftPercent,
    fundPercent: totalValue > 0 ? fundValue / totalValue : 0,
    missingResearchPercent: holdings.length > 0 ? missingResearchCount / holdings.length : 0,
  });

  const opportunityHoldings: OpportunityHoldingInput[] = holdings.map((h) => ({
    companyId: h.companyId,
    companyName: h.companyName,
    ticker: h.ticker,
    investmentRating: h.investmentRating,
    allocationPercent: combinedAllocationPercent.get(h.companyId) ?? 0,
    targetAllocationPercent: h.targetAllocationPercent,
    allocationDifferencePercent:
      (combinedAllocationPercent.get(h.companyId) ?? 0) - h.targetAllocationPercent,
    dailyChangePercent: h.performance.dailyChangePercent,
  }));
  const opportunities = identifyOpportunities(opportunityHoldings, cash, totalValue);

  const insights = generatePortfolioInsights({
    cashPercent: totalValue > 0 ? cash / totalValue : 0,
    cashTargetPercent: CASH_TARGET_PERCENT,
    concentrationWarnings,
    heldSectors: [...new Set(riskHoldings.map((h) => h.sector))],
    watchedSectorsForGaps: WATCHED_SECTORS_FOR_GAPS,
  });

  const allocationRows: AllocationRow[] = holdings.map((h) => {
    const currentPercent = combinedAllocationPercent.get(h.companyId) ?? 0;
    const differencePercent = currentPercent - h.targetAllocationPercent;
    const thesisStatus = snapshots.get(h.companyId)?.thesisStatus ?? null;
    return {
      companyId: h.companyId,
      companyName: h.companyName,
      ticker: h.ticker,
      currentPercent,
      targetPercent: h.targetAllocationPercent,
      differencePercent,
      action: calculateAllocationAction(differencePercent, thesisStatus, h.investmentRating),
    };
  });

  return {
    health,
    sectorAllocation,
    countryAllocation,
    currencyExposure,
    concentrationWarnings,
    opportunities,
    insights,
    allocationRows,
    totalValue,
    cash,
  };
}
