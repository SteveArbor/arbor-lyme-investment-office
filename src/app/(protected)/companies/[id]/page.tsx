import type { Metadata } from "next";
import Link from "next/link";

import {
  buildCompanyMonitoringSnapshot,
  buildPortfolioPerformanceData,
  buildPortfolioValuation,
  type CompanyLookup,
  composeAppServices,
} from "@/application/services";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { cardClasses } from "@/components/ui/form-styles";
import {
  calculateDailyChange,
  calculateQuoteAge,
  type PriceQuality,
  type SecurityIdentifier,
} from "@/domain/market";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import {
  formatCurrency,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClasses,
} from "@/lib/format";

import { GenerateRatingForm } from "./generate-rating-form";
import { RATING_LABELS, THESIS_STATUS_LABELS } from "./labels";

export const metadata: Metadata = {
  title: "Company overview — Arbor Lyme Capital",
};

const QUALITY_LABELS: Record<PriceQuality, string> = {
  real_time: "Real-time",
  delayed: "Delayed",
  previous_close: "Previous close",
  manual: "Manual",
};

const STALE_AFTER_SECONDS = 20 * 60;

function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return "just now";
  const minutes = Math.round(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function CompanyOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const services = composeAppServices(supabase);
  const {
    companyService,
    quoteRepository,
    fxRateRepository,
    portfolioService,
    tradingService,
    decisionService,
    journalService,
    settingsService,
  } = services;
  const company = await companyService.getCompany(user!.id, id);
  const [snapshot, settings, journalEntries] = await Promise.all([
    buildCompanyMonitoringSnapshot(services, user!.id, id),
    settingsService.getSettings(user!.id),
    journalService.listEntriesForCompany(user!.id, id),
  ]);

  // Live quote propagation (ADR 0032): read only what a prior "Refresh
  // prices" click already persisted — this page never calls Twelve Data
  // (or any vendor) directly. Funds are never looked up: no live provider
  // is configured for them (Stage 2 scope).
  const quote =
    company.securityType !== "fund"
      ? await quoteRepository.getLatest(user!.id, {
          type: company.securityType,
          ticker: company.ticker,
          exchange: company.exchange,
          currency: company.currency,
        } satisfies SecurityIdentifier)
      : null;
  const now = new Date().toISOString();
  const quoteAge = quote ? calculateQuoteAge(quote, now, STALE_AFTER_SECONDS) : null;
  const dailyChange = quote ? calculateDailyChange(quote) : null;
  const isManualPrice =
    company.securityType === "fund" || quote === null || quote.quality === "manual";

  // Research Completeness — real signals from research/thesis/valuation/
  // decision/journal, not a placeholder: every one of these domains
  // already exists and is queried above/below, so there's nothing
  // fabricated about reporting whether each has been filled in yet.
  const researchCompletenessItems = [
    { label: "Research notes", present: Boolean(snapshot.risks || snapshot.monitoringMetrics) },
    { label: "Investment thesis", present: snapshot.thesisStatus !== null },
    { label: "Valuation", present: snapshot.blendedFairValue > 0 },
    { label: "Investment Rating", present: snapshot.latestRating !== null },
    { label: "Journal entry", present: journalEntries.length > 0 },
  ];
  const researchCompletePercent =
    researchCompletenessItems.filter((item) => item.present).length /
    researchCompletenessItems.length;

  // Position Summary — every portfolio this owner has that currently
  // holds this company, with market value/allocation/return computed via
  // the same `buildPortfolioValuation` composer the Portfolio and
  // Dashboard pages use (ADR 0032), so this page can never disagree with
  // them about a holding's converted value. Every company (not just this
  // one) is fetched so each portfolio's *total* value — the denominator
  // `buildPortfolioValuation` divides allocation by — is correct; passing
  // only this company would silently drop every other holding from the
  // total and understate this position's true allocation percentage.
  const [allPortfolios, allCompanies] = await Promise.all([
    portfolioService.listPortfolios(user!.id),
    companyService.listCompanies(user!.id),
  ]);
  const holdingsByPortfolio = await Promise.all(
    allPortfolios.map(async (portfolio) => ({
      portfolio,
      holding: await portfolioService.getHolding(user!.id, portfolio.id, id),
    }))
  );
  const heldIn = holdingsByPortfolio.filter(
    (
      entry
    ): entry is {
      portfolio: (typeof allPortfolios)[number];
      holding: NonNullable<(typeof holdingsByPortfolio)[number]["holding"]>;
    } => entry.holding !== null
  );

  const companyLookupById = new Map<string, CompanyLookup>(
    allCompanies.map((c) => [
      c.id,
      {
        ticker: c.ticker,
        exchange: c.exchange,
        currency: c.currency,
        securityType: c.securityType,
        name: c.name,
      },
    ])
  );
  const allExchangeTradedIdentifiers = allCompanies
    .filter((c) => c.securityType !== "fund")
    .map((c) => ({
      type: c.securityType,
      ticker: c.ticker,
      exchange: c.exchange,
      currency: c.currency,
    }));
  const allHeldCurrencies = new Set(allCompanies.map((c) => c.currency));
  const allFxPairs = [...allHeldCurrencies]
    .filter((currency) => currency !== settings.baseCurrency)
    .map((currency) => ({ base: currency, quote: settings.baseCurrency }));
  const [allQuotes, allFxRates] = await Promise.all([
    quoteRepository.getLatestForMany(user!.id, allExchangeTradedIdentifiers),
    fxRateRepository.getLatestForMany(user!.id, allFxPairs),
  ]);
  const positionRows = await Promise.all(
    heldIn.map(async ({ portfolio, holding }) => {
      const performanceData = await buildPortfolioPerformanceData(
        { portfolioService, tradingService, decisionService },
        user!.id,
        portfolio.id
      );
      const valuation = buildPortfolioValuation(
        performanceData,
        companyLookupById,
        allQuotes,
        allFxRates,
        settings.baseCurrency,
        new Date().toISOString()
      );
      const holdingValuation = valuation.holdings.find((h) => h.companyId === id);
      return { portfolio, holding, holdingValuation };
    })
  );

  return (
    <div className="space-y-6">
      <div className={cardClasses}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {company.name} ({company.ticker})
          </h2>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {company.status}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Exchange</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{company.exchange}</dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Sector</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{company.sector}</dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Industry</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{company.industry}</dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Currency</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{company.currency}</dd>
          </div>
        </dl>
        {company.profile ? (
          <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">{company.profile}</p>
        ) : null}
      </div>

      <div className={cardClasses}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Market price
          </h3>
          {company.securityType === "fund" ? (
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              Manually priced — no live provider for funds yet
            </span>
          ) : null}
        </div>
        {quote ? (
          <>
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <p className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                {formatCurrency(quote.price, quote.currency)}
              </p>
              {dailyChange ? (
                <p className={`text-sm font-medium ${gainLossClasses(dailyChange.amount)}`}>
                  {formatSignedCurrency(dailyChange.amount, quote.currency)} (
                  {formatSignedPercent(dailyChange.percent)})
                </p>
              ) : null}
              {isManualPrice ? (
                <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                  Manual
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-neutral-500 dark:text-neutral-500">Trading currency</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">{quote.currency}</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-500">Quality</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">
                  {QUALITY_LABELS[quote.quality]}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-500">Provider</dt>
                <dd className="text-neutral-900 dark:text-neutral-100">{quote.providerName}</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-500">Last update</dt>
                <dd
                  className={
                    quoteAge?.isStale
                      ? "text-amber-700 dark:text-amber-500"
                      : "text-neutral-900 dark:text-neutral-100"
                  }
                >
                  {formatAge(quoteAge?.ageSeconds ?? 0)}
                  {quoteAge?.isStale ? " · stale" : ""}
                </dd>
              </div>
            </dl>
          </>
        ) : (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {company.securityType === "fund"
              ? "No manual price has been entered yet — set one from a portfolio that holds this fund."
              : "No price has been refreshed yet — use “Refresh prices” on a portfolio that holds this holding."}
          </p>
        )}
      </div>

      <div className={cardClasses}>
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Position summary
        </h3>
        {positionRows.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Not currently held in any portfolio.
          </p>
        ) : (
          <div className="-mx-5 mt-3 overflow-x-auto px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:text-neutral-500">
                  <th className="py-2 pr-3 font-medium">Portfolio</th>
                  <th className="py-2 pr-3 font-medium">Quantity</th>
                  <th className="py-2 pr-3 font-medium">Market value</th>
                  <th className="py-2 pr-3 font-medium">Allocation</th>
                  <th className="py-2 font-medium">Return</th>
                </tr>
              </thead>
              <tbody>
                {positionRows.map(({ portfolio, holding, holdingValuation }) => (
                  <tr
                    key={portfolio.id}
                    className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
                  >
                    <td className="py-2 pr-3">
                      <Link
                        href={`/portfolio/${portfolio.id}`}
                        className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                      >
                        {portfolio.name}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 text-neutral-700 tabular-nums dark:text-neutral-300">
                      {holding.quantity}
                    </td>
                    <td className="py-2 pr-3 text-neutral-700 tabular-nums dark:text-neutral-300">
                      {holdingValuation
                        ? formatCurrency(
                            holdingValuation.performance.marketValue,
                            settings.baseCurrency
                          )
                        : formatCurrency(
                            holding.quantity * holding.averageCost,
                            settings.baseCurrency
                          )}
                    </td>
                    <td className="py-2 pr-3 text-neutral-700 tabular-nums dark:text-neutral-300">
                      {holdingValuation
                        ? formatPercent(holdingValuation.performance.allocationPercent)
                        : "—"}
                    </td>
                    <td
                      className={`py-2 tabular-nums ${holdingValuation ? gainLossClasses(holdingValuation.performance.unrealisedGain) : ""}`}
                    >
                      {holdingValuation
                        ? formatSignedCurrency(
                            holdingValuation.performance.unrealisedGain,
                            settings.baseCurrency
                          )
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={cardClasses}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Investment Rating
          </h3>
          <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {snapshot.latestRating ? RATING_LABELS[snapshot.latestRating] : "Not rated yet"}
          </p>
          {snapshot.expectedReturn !== null ? (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Expected return: {(snapshot.expectedReturn * 100).toFixed(1)}%
            </p>
          ) : null}
        </div>

        <div className={cardClasses}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Thesis & valuation
          </h3>
          <p className="mt-2 text-sm text-neutral-900 dark:text-neutral-100">
            Thesis: {THESIS_STATUS_LABELS[snapshot.thesisStatus]}
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {snapshot.blendedFairValue > 0 ? (
              <>
                Fair value: {snapshot.blendedFairValue.toFixed(2)} · Required margin of safety:{" "}
                {(snapshot.marginOfSafety * 100).toFixed(0)}%
              </>
            ) : (
              // getOrCreateValuation (application/services/monitoring.ts)
              // returns a real row with blendedFairValue: 0 the first time
              // this page is viewed for a company with no valuation
              // entered yet -- a genuine DCF result of exactly 0.00 doesn't
              // otherwise occur, so this is a reliable "still the
              // untouched default" signal. Showing "0.00" here would be
              // indistinguishable from a real $0 valuation, which this
              // codebase's "no invented data" principle doesn't allow
              // (docs/implementation/production-readiness.md).
              <>Not yet valued.</>
            )}
          </p>
          {snapshot.openJournalEntry ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Open journal entry since{" "}
              {new Date(snapshot.openJournalEntry.purchaseDate).toLocaleDateString()} — see{" "}
              <Link href={`/companies/${id}/journal`} className="underline">
                Journal
              </Link>
              .
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={cardClasses}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Research completeness
            </h3>
            <span className="text-sm font-semibold text-neutral-700 tabular-nums dark:text-neutral-300">
              {Math.round(researchCompletePercent * 100)}%
            </span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {researchCompletenessItems.map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={
                    item.present
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-neutral-400 dark:text-neutral-600"
                  }
                >
                  {item.present ? "✓" : "○"}
                </span>
                <span
                  className={
                    item.present
                      ? "text-neutral-900 dark:text-neutral-100"
                      : "text-neutral-500 dark:text-neutral-500"
                  }
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={cardClasses}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Journal entries
          </h3>
          {journalEntries.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              No journal entries recorded yet.{" "}
              <Link href={`/companies/${id}/journal`} className="underline">
                Add one
              </Link>{" "}
              to capture the reasoning behind this position.
            </p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {journalEntries.slice(0, 3).map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2">
                  <span className="text-neutral-700 dark:text-neutral-300">
                    {entry.status === "open" ? "Open" : "Closed"} —{" "}
                    {new Date(entry.purchaseDate).toLocaleDateString()}
                  </span>
                  <span className="text-neutral-500 dark:text-neutral-500">
                    Confidence {(entry.convictionAtPurchase * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-sm">
            <Link href={`/companies/${id}/journal`} className="underline">
              View all journal entries →
            </Link>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <EmptyStateCard
          title="Documents"
          description="Filings, transcripts, and research notes attached to this company will appear here."
          phase="Planned — Phase 5"
        />
        <EmptyStateCard
          title="Upcoming events"
          description="Earnings dates, dividend dates, and review reminders for this company will appear here. Manual entry is planned; nothing is fabricated here yet."
          phase="Planned — future milestone"
        />
      </div>

      <div className={cardClasses}>
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Generate an Investment Rating
        </h3>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Deterministic — combines business quality, moat, financial strength, capital allocation,
          growth, and risk with expected return and margin of safety (ADR 0023).
        </p>
        <div className="mt-4">
          <GenerateRatingForm companyId={id} />
        </div>
      </div>
    </div>
  );
}
