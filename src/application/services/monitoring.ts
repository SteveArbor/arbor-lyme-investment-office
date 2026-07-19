import type { InvestmentRating } from "@/domain/decision";
import type { DecisionService } from "@/domain/decision";
import type { JournalEntry, JournalService } from "@/domain/journal";
import type { Holding, PortfolioService } from "@/domain/portfolio";
import type { ResearchService } from "@/domain/research";
import type { ThesisService, ThesisStatementStatus } from "@/domain/thesis";
import {
  calculateValuationStatus,
  type ValuationService,
  type ValuationStatus,
} from "@/domain/valuation";

export interface CompanyMonitoringSnapshot {
  companyId: string;
  thesisStatus: ThesisStatementStatus;
  valuationStatus: ValuationStatus | null;
  marginOfSafety: number;
  blendedFairValue: number;
  latestRating: InvestmentRating | null;
  expectedReturn: number | null;
  risks: string | null;
  monitoringMetrics: string | null;
  holding: Holding | null;
  openJournalEntry: JournalEntry | null;
}

export interface MonitoringDependencies {
  researchService: Pick<ResearchService, "getOrCreateResearch">;
  thesisService: Pick<ThesisService, "getOrCreateThesis">;
  valuationService: Pick<ValuationService, "getOrCreateValuation">;
  decisionService: Pick<DecisionService, "getLatestRating">;
  portfolioService: Pick<PortfolioService, "getHolding">;
  journalService: Pick<JournalService, "listEntriesForCompany">;
}

export interface MonitoringSnapshotOptions {
  portfolioId?: string;
  currentPrice?: number;
}

/**
 * The Monitoring Dashboard's read model (docs/development-roadmap.md
 * Phase 2, item 9). Deliberately not a bounded context with its own
 * storage: every field here is already owned and computed by another
 * domain (research, thesis, valuation, decision, portfolio, journal) —
 * this function only assembles the latest state of each. That is what
 * makes "a future earnings update is a single write that flows through to
 * every dependent view" true: the write happens once, in the domain that
 * owns the data, and this snapshot always reads the current row — nothing
 * is duplicated or cached here to go stale.
 */
export async function buildCompanyMonitoringSnapshot(
  deps: MonitoringDependencies,
  ownerId: string,
  companyId: string,
  options: MonitoringSnapshotOptions = {}
): Promise<CompanyMonitoringSnapshot> {
  const [research, thesis, valuation, latestRating, journalEntries] = await Promise.all([
    deps.researchService.getOrCreateResearch(ownerId, companyId),
    deps.thesisService.getOrCreateThesis(ownerId, companyId),
    deps.valuationService.getOrCreateValuation(ownerId, companyId),
    deps.decisionService.getLatestRating(ownerId, companyId),
    deps.journalService.listEntriesForCompany(ownerId, companyId),
  ]);

  const holding = options.portfolioId
    ? await deps.portfolioService.getHolding(ownerId, options.portfolioId, companyId)
    : null;

  const valuationStatus =
    options.currentPrice !== undefined
      ? calculateValuationStatus(
          options.currentPrice,
          valuation.blendedFairValue,
          valuation.marginOfSafety
        )
      : null;

  return {
    companyId,
    thesisStatus: thesis.overallStatus,
    valuationStatus,
    marginOfSafety: valuation.marginOfSafety,
    blendedFairValue: valuation.blendedFairValue,
    latestRating: latestRating?.rating ?? null,
    expectedReturn: latestRating?.inputs.expectedReturn ?? null,
    risks: research.risks,
    monitoringMetrics: research.monitoringMetrics,
    holding,
    openJournalEntry: journalEntries.find((entry) => entry.status === "open") ?? null,
  };
}
