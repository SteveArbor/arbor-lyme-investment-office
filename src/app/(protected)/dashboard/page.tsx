import type { Metadata } from "next";
import Link from "next/link";

import {
  buildCompanyMonitoringSnapshots,
  buildPortfolioPerformanceData,
  buildPortfolioValuation,
  type CompanyLookup,
  composeAppServices,
  type HoldingValuation,
} from "@/application/services";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { cardClasses, inputClasses, labelClasses } from "@/components/ui/form-styles";
import {
  clickableCellLinkClasses,
  clickableRowClasses,
  tableBodyClasses,
  tableClasses,
  tableContainerClasses,
  tableHeadClasses,
} from "@/components/ui/table";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { formatCurrency, formatSignedCurrency, gainLossClasses } from "@/lib/format";

import { RATING_LABELS, THESIS_STATUS_LABELS } from "../companies/[id]/labels";

export const metadata: Metadata = {
  title: "Dashboard — Arbor Lyme Capital",
};

interface PriorityAction {
  companyId: string;
  companyName: string;
  reason: string;
  weight: number;
}

function SummaryCard({
  label,
  value,
  valueClassName = "text-neutral-900 dark:text-neutral-100",
  subValue,
  href,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  subValue?: string;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClassName}`}>{value}</p>
      {subValue ? (
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{subValue}</p>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={`${cardClasses} block transition hover:border-neutral-400 dark:hover:border-neutral-600`}
      >
        {content}
      </Link>
    );
  }
  return <div className={cardClasses}>{content}</div>;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ portfolio?: string }>;
}) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const services = composeAppServices(supabase);
  const {
    companyService,
    portfolioService,
    tradingService,
    decisionService,
    settingsService,
    quoteRepository,
    fxRateRepository,
  } = services;

  const [companies, allPortfolios, settings] = await Promise.all([
    companyService.listCompanies(user!.id),
    portfolioService.listPortfolios(user!.id),
    settingsService.getSettings(user!.id),
  ]);
  const baseCurrency = settings.baseCurrency;

  // "All portfolios" (no selection) is today's only consolidated view — a
  // future milestone will build real cross-portfolio reporting; this
  // selector's job for now is just letting the daily-workspace cards focus
  // on one portfolio at a time instead of always summing every portfolio.
  const selectedPortfolioId =
    query.portfolio && allPortfolios.some((p) => p.id === query.portfolio)
      ? query.portfolio
      : undefined;
  const portfolios = selectedPortfolioId
    ? allPortfolios.filter((p) => p.id === selectedPortfolioId)
    : allPortfolios;

  const [snapshots, performanceByPortfolio] = await Promise.all([
    buildCompanyMonitoringSnapshots(
      services,
      user!.id,
      companies.map((company) => company.id)
    ),
    Promise.all(
      portfolios.map((portfolio) =>
        buildPortfolioPerformanceData(
          { portfolioService, tradingService, decisionService },
          user!.id,
          portfolio.id
        )
      )
    ),
  ]);

  // Live quote propagation (ADR 0032): the same persisted quotes and FX
  // rates the Portfolio Performance panel reads — no vendor call happens
  // here, ever; this reads only what a prior "Refresh prices" click
  // already stored. One shared fetch across every company/currency this
  // user has, then joined per portfolio via the same `buildPortfolioValuation`
  // composer the portfolio detail page uses, so the two views can never
  // disagree about how a holding was converted.
  const companyLookupById = new Map<string, CompanyLookup>(
    companies.map((company) => [
      company.id,
      {
        ticker: company.ticker,
        exchange: company.exchange,
        currency: company.currency,
        securityType: company.securityType,
        name: company.name,
      },
    ])
  );
  const exchangeTradedIdentifiers = companies
    .filter((company) => company.securityType !== "fund")
    .map((company) => ({
      type: company.securityType,
      ticker: company.ticker,
      exchange: company.exchange,
      currency: company.currency,
    }));
  const heldCurrencies = new Set(companies.map((company) => company.currency));
  const fxPairs = [...heldCurrencies]
    .filter((currency) => currency !== baseCurrency)
    .map((currency) => ({ base: currency, quote: baseCurrency }));
  const [quotes, fxRates] = await Promise.all([
    quoteRepository.getLatestForMany(user!.id, exchangeTradedIdentifiers),
    fxRateRepository.getLatestForMany(user!.id, fxPairs),
  ]);
  const now = new Date().toISOString();
  const valuations = performanceByPortfolio.map((data) =>
    buildPortfolioValuation(data, companyLookupById, quotes, fxRates, baseCurrency, now)
  );

  const totalCash = portfolios.reduce((sum, portfolio) => sum + portfolio.cash, 0);
  const totalValue = valuations.reduce((sum, v) => sum + v.performance.totalValue, 0);
  const totalUnrealisedGain = valuations.reduce((sum, v) => sum + v.performance.unrealisedGain, 0);
  const totalHoldingsCount = performanceByPortfolio.reduce(
    (sum, data) => sum + data.holdings.length,
    0
  );
  const totalRealisedReturn = performanceByPortfolio.reduce(
    (sum, data) =>
      sum + data.realisedGainTotal + data.dividendsReceived - data.feesPaid - data.taxesPaid,
    0
  );
  const dailyGains = valuations.map((v) => v.performance.dailyGain).filter((g): g is number => g !== null);
  const totalDailyGain = dailyGains.length > 0 ? dailyGains.reduce((a, b) => a + b, 0) : null;
  const totalDailyGainPercent =
    totalDailyGain !== null && totalValue - totalDailyGain !== 0
      ? totalDailyGain / (totalValue - totalDailyGain)
      : null;
  const quoteCoverage = valuations.reduce(
    (acc, v) => ({
      total: acc.total + v.quoteCoverage.total,
      live: acc.live + v.quoteCoverage.live,
      manual: acc.manual + v.quoteCoverage.manual,
      stale: acc.stale + v.quoteCoverage.stale,
    }),
    { total: 0, live: 0, manual: 0, stale: 0 }
  );
  const lastMarketUpdate = valuations.reduce<string | null>((latest, v) => {
    if (!v.lastMarketUpdate) return latest;
    if (!latest || v.lastMarketUpdate > latest) return v.lastMarketUpdate;
    return latest;
  }, null);
  const allHoldingsWithDailyChange: HoldingValuation[] = valuations
    .flatMap((v) => v.holdings)
    .filter((h) => h.performance.dailyChangeAmountBase !== null);
  const largestDailyGainer = allHoldingsWithDailyChange.reduce<HoldingValuation | null>(
    (largest, h) =>
      largest === null ||
      h.performance.dailyChangeAmountBase! > largest.performance.dailyChangeAmountBase!
        ? h
        : largest,
    null
  );
  const largestDailyLoser = allHoldingsWithDailyChange.reduce<HoldingValuation | null>(
    (smallest, h) =>
      smallest === null ||
      h.performance.dailyChangeAmountBase! < smallest.performance.dailyChangeAmountBase!
        ? h
        : smallest,
    null
  );
  const currency = baseCurrency;

  const priorityActions: PriorityAction[] = [];
  for (const company of companies) {
    const snapshot = snapshots.get(company.id);
    if (!snapshot) continue;
    if (snapshot.openJournalEntry) {
      priorityActions.push({
        companyId: company.id,
        companyName: company.name,
        reason: "Open journal entry needs follow-up",
        weight: 0,
      });
    }
    if (!snapshot.thesisStatus) {
      priorityActions.push({
        companyId: company.id,
        companyName: company.name,
        reason: "No investment thesis recorded yet",
        weight: 1,
      });
    }
    if (!snapshot.latestRating) {
      priorityActions.push({
        companyId: company.id,
        companyName: company.name,
        reason: "No Investment Rating generated yet",
        weight: 2,
      });
    }
  }
  priorityActions.sort((a, b) => a.weight - b.weight);
  const topActions = priorityActions.slice(0, 6);

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            Dashboard
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
            Your daily workspace — portfolio position, research coverage, and what needs
            attention next.
          </p>
        </div>
        {allPortfolios.length > 1 ? (
          <form method="get" className="flex items-end gap-2">
            <div>
              <label htmlFor="portfolio" className={labelClasses}>
                Portfolio
              </label>
              <select
                id="portfolio"
                name="portfolio"
                defaultValue={selectedPortfolioId ?? ""}
                className={`${inputClasses} w-auto`}
              >
                <option value="">All portfolios</option>
                {allPortfolios.map((portfolio) => (
                  <option key={portfolio.id} value={portfolio.id}>
                    {portfolio.name}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={`${inputClasses.replace("mt-1 ", "")} w-auto px-4`}>
              View
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Current portfolio value"
          value={formatCurrency(totalValue, currency)}
          href={portfolios[0] ? `/portfolio/${portfolios[0].id}` : "/portfolio"}
        />
        <SummaryCard
          label="Cash"
          value={formatCurrency(totalCash, currency)}
          href={portfolios[0] ? `/portfolio/${portfolios[0].id}` : "/portfolio"}
        />
        <SummaryCard
          label="Unrealised gain"
          value={formatSignedCurrency(totalUnrealisedGain, currency)}
          valueClassName={gainLossClasses(totalUnrealisedGain)}
          href={portfolios[0] ? `/portfolio/${portfolios[0].id}` : "/portfolio"}
        />
        <SummaryCard
          label="Daily gain"
          value={
            totalDailyGain !== null ? formatSignedCurrency(totalDailyGain, currency) : "No live quotes"
          }
          valueClassName={totalDailyGain !== null ? gainLossClasses(totalDailyGain) : undefined}
          subValue={
            totalDailyGainPercent !== null
              ? `${totalDailyGainPercent >= 0 ? "+" : ""}${(totalDailyGainPercent * 100).toFixed(2)}%`
              : "Refresh a portfolio's prices to see"
          }
        />
        <SummaryCard
          label="Realised return"
          value={formatSignedCurrency(totalRealisedReturn, currency)}
          valueClassName={gainLossClasses(totalRealisedReturn)}
          subValue="Realised gains + dividends − fees − taxes"
        />
        <SummaryCard
          label="Quote coverage"
          value={`${quoteCoverage.live} live · ${quoteCoverage.manual} manual`}
          valueClassName={
            quoteCoverage.stale > 0
              ? "text-amber-700 dark:text-amber-400"
              : "text-neutral-900 dark:text-neutral-100"
          }
          subValue={quoteCoverage.stale > 0 ? `${quoteCoverage.stale} stale` : "Last market update"}
        />
        <SummaryCard
          label="Last market update"
          value={lastMarketUpdate ? new Date(lastMarketUpdate).toLocaleString("en-GB") : "No live quotes yet"}
        />
        <SummaryCard
          label="Largest daily gainer"
          value={largestDailyGainer ? `${largestDailyGainer.companyName} (${largestDailyGainer.ticker})` : "—"}
          valueClassName="text-emerald-700 dark:text-emerald-400"
          subValue={
            largestDailyGainer
              ? formatSignedCurrency(largestDailyGainer.performance.dailyChangeAmountBase!, currency)
              : undefined
          }
        />
        <SummaryCard
          label="Largest daily loser"
          value={largestDailyLoser ? `${largestDailyLoser.companyName} (${largestDailyLoser.ticker})` : "—"}
          valueClassName="text-red-700 dark:text-red-400"
          subValue={
            largestDailyLoser
              ? formatSignedCurrency(largestDailyLoser.performance.dailyChangeAmountBase!, currency)
              : undefined
          }
        />
        <SummaryCard label="Holdings" value={String(totalHoldingsCount)} href="/portfolio" />
        <SummaryCard label="Companies tracked" value={String(companies.length)} href="/companies" />
        <SummaryCard
          label="High priority actions"
          value={String(priorityActions.length)}
          valueClassName={
            priorityActions.length > 0
              ? "text-amber-700 dark:text-amber-400"
              : "text-neutral-900 dark:text-neutral-100"
          }
        />
        <SummaryCard label="Portfolios" value={String(allPortfolios.length)} href="/portfolio" />
      </div>

      {topActions.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            High priority actions
          </h2>
          <div className="mt-3 space-y-2">
            {topActions.map((action, index) => (
              <Link
                key={`${action.companyId}-${index}`}
                href={`/companies/${action.companyId}`}
                className={`${cardClasses} flex items-center justify-between gap-2 transition hover:border-neutral-400 dark:hover:border-neutral-600`}
              >
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {action.companyName}
                </span>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {action.reason}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Company watchlist
        </h2>
        <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">
          Thesis status, valuation, and Investment Rating — assembled from research, thesis,
          valuation, and decision.
        </p>
      </div>

      {companies.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            No companies tracked yet.{" "}
            <Link href="/companies/new" className="underline">
              Add one
            </Link>{" "}
            to populate this dashboard.
          </p>
        </div>
      ) : (
        <div className={`mt-3 ${tableContainerClasses}`}>
          <table className={tableClasses}>
            <thead className={tableHeadClasses}>
              <tr>
                <th scope="col" className="px-4 py-3">
                  Company
                </th>
                <th scope="col" className="px-4 py-3">
                  Thesis
                </th>
                <th scope="col" className="px-4 py-3">
                  Fair value
                </th>
                <th scope="col" className="px-4 py-3">
                  Rating
                </th>
                <th scope="col" className="px-4 py-3">
                  Open journal entry
                </th>
              </tr>
            </thead>
            <tbody className={tableBodyClasses}>
              {companies.map((company) => {
                const snapshot = snapshots.get(company.id);
                return (
                  <tr key={company.id} className={clickableRowClasses}>
                    <td className="p-0">
                      <Link
                        href={`/companies/${company.id}`}
                        className={`${clickableCellLinkClasses} font-medium text-neutral-900 dark:text-neutral-100`}
                      >
                        {company.name}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={`/companies/${company.id}`}
                        className={`${clickableCellLinkClasses} text-neutral-600 dark:text-neutral-400`}
                      >
                        {snapshot?.thesisStatus
                          ? THESIS_STATUS_LABELS[snapshot.thesisStatus]
                          : "No thesis yet"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={`/companies/${company.id}`}
                        className={`${clickableCellLinkClasses} text-neutral-600 dark:text-neutral-400`}
                      >
                        {snapshot?.blendedFairValue !== null &&
                        snapshot?.blendedFairValue !== undefined
                          ? snapshot.blendedFairValue.toFixed(2)
                          : "Not yet valued"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={`/companies/${company.id}`}
                        className={`${clickableCellLinkClasses} text-neutral-600 dark:text-neutral-400`}
                      >
                        {snapshot?.latestRating
                          ? RATING_LABELS[snapshot.latestRating]
                          : "Not rated"}
                      </Link>
                    </td>
                    <td className="p-0">
                      <Link
                        href={`/companies/${company.id}`}
                        className={`${clickableCellLinkClasses} text-neutral-600 dark:text-neutral-400`}
                      >
                        {snapshot?.openJournalEntry ? "Yes" : ""}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EmptyStateCard
          title="Daily briefing"
          description="An AI-assisted summary of your portfolio will appear here, built entirely from verified data."
          phase="Planned — Phase 4"
        />
        <EmptyStateCard
          title="Alerts"
          description="Rule-driven signals and rating-change notifications will appear here."
          phase="Planned — Phase 5"
        />
        <EmptyStateCard
          title="Reporting & benchmarking"
          description="Exportable period reports and benchmark comparisons will appear here."
          phase="Planned — Phase 6"
        />
      </div>
    </main>
  );
}
