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

export interface CompanyMonitoringSummary {
  companyId: string;
  /** null means no thesis has been recorded yet — distinct from a real "stable" status. */
  thesisStatus: ThesisStatementStatus | null;
  /** null means no valuation has been recorded yet — never a fabricated default figure. */
  marginOfSafety: number | null;
  blendedFairValue: number | null;
  latestRating: InvestmentRating | null;
  expectedReturn: number | null;
  risks: string | null;
  monitoringMetrics: string | null;
  openJournalEntry: JournalEntry | null;
}

export interface BatchMonitoringDependencies {
  researchService: Pick<ResearchService, "listResearchForCompanies">;
  thesisService: Pick<ThesisService, "listThesesForCompanies">;
  valuationService: Pick<ValuationService, "listValuationsForCompanies">;
  decisionService: Pick<DecisionService, "getLatestRatings">;
  journalService: Pick<JournalService, "listEntriesForCompanies">;
}

/**
 * The Monitoring Dashboard's batch read model — one call per domain for
 * every company being listed, not one call per domain PER company (Phase 2
 * Architecture Review finding 4.5: the single-company
 * buildCompanyMonitoringSnapshot above issues 5 queries and, via
 * getOrCreate*, can write a default row purely from being viewed; neither
 * is acceptable at dashboard scale). Companies with no research/thesis/
 * valuation/rating yet are represented with null fields here, not a
 * fabricated default — a dashboard listing many companies must not imply
 * a real valuation exists where none has been entered.
 */
export async function buildCompanyMonitoringSnapshots(
  deps: BatchMonitoringDependencies,
  ownerId: string,
  companyIds: string[]
): Promise<Map<string, CompanyMonitoringSummary>> {
  if (companyIds.length === 0) return new Map();

  const [researchNotes, theses, valuations, latestRatings, journalEntries] = await Promise.all([
    deps.researchService.listResearchForCompanies(ownerId, companyIds),
    deps.thesisService.listThesesForCompanies(ownerId, companyIds),
    deps.valuationService.listValuationsForCompanies(ownerId, companyIds),
    deps.decisionService.getLatestRatings(ownerId, companyIds),
    deps.journalService.listEntriesForCompanies(ownerId, companyIds),
  ]);

  const researchByCompany = new Map(researchNotes.map((row) => [row.companyId, row]));
  const thesisByCompany = new Map(theses.map((row) => [row.companyId, row]));
  const valuationByCompany = new Map(valuations.map((row) => [row.companyId, row]));
  const ratingByCompany = new Map(latestRatings.map((row) => [row.companyId, row]));
  const openJournalByCompany = new Map<string, JournalEntry>();
  for (const entry of journalEntries) {
    if (entry.status === "open" && !openJournalByCompany.has(entry.companyId)) {
      openJournalByCompany.set(entry.companyId, entry);
    }
  }

  const summaries = new Map<string, CompanyMonitoringSummary>();
  for (const companyId of companyIds) {
    const research = researchByCompany.get(companyId);
    const thesis = thesisByCompany.get(companyId);
    const valuation = valuationByCompany.get(companyId);
    const rating = ratingByCompany.get(companyId);

    summaries.set(companyId, {
      companyId,
      thesisStatus: thesis?.overallStatus ?? null,
      marginOfSafety: valuation?.marginOfSafety ?? null,
      blendedFairValue: valuation?.blendedFairValue ?? null,
      latestRating: rating?.rating ?? null,
      expectedReturn: rating?.inputs.expectedReturn ?? null,
      risks: research?.risks ?? null,
      monitoringMetrics: research?.monitoringMetrics ?? null,
      openJournalEntry: openJournalByCompany.get(companyId) ?? null,
    });
  }

  return summaries;
}
