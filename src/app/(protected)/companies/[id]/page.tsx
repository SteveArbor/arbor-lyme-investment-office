import type { Metadata } from "next";
import Link from "next/link";

import { buildCompanyMonitoringSnapshot, composeAppServices } from "@/application/services";
import { cardClasses } from "@/components/ui/form-styles";
import {
  calculateDailyChange,
  calculateQuoteAge,
  type PriceQuality,
  type SecurityIdentifier,
} from "@/domain/market";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { formatCurrency, formatSignedCurrency, formatSignedPercent, gainLossClasses } from "@/lib/format";

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
  const { companyService, quoteRepository, portfolioService, settingsService } = services;
  const company = await companyService.getCompany(user!.id, id);
  const [snapshot, settings] = await Promise.all([
    buildCompanyMonitoringSnapshot(services, user!.id, id),
    settingsService.getSettings(user!.id),
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
  const isManualPrice = company.securityType === "fund" || quote === null || quote.quality === "manual";

  // Portfolio ownership summary — every portfolio this owner has that
  // currently holds this company, with quantity and cost basis. No new
  // repository method: reuses `listPortfolios`/`listHoldings` exactly as
  // the Portfolio Performance panel does, just filtered to one company.
  const allPortfolios = await portfolioService.listPortfolios(user!.id);
  const holdingsByPortfolio = await Promise.all(
    allPortfolios.map(async (portfolio) => ({
      portfolio,
      holding: await portfolioService.getHolding(user!.id, portfolio.id, id),
    }))
  );
  const ownership = holdingsByPortfolio.filter(
    (entry): entry is { portfolio: (typeof allPortfolios)[number]; holding: NonNullable<(typeof holdingsByPortfolio)[number]["holding"]> } =>
      entry.holding !== null
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
        {ownership.length > 0 ? (
          <div className="mt-4 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Portfolio ownership
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {ownership.map(({ portfolio, holding }) => (
                <li key={portfolio.id} className="flex items-center justify-between gap-2">
                  <Link href={`/portfolio/${portfolio.id}`} className="text-neutral-900 hover:underline dark:text-neutral-100">
                    {portfolio.name}
                  </Link>
                  <span className="text-neutral-600 dark:text-neutral-400">
                    {holding.quantity} @ {formatCurrency(holding.averageCost, settings.baseCurrency)} avg
                    cost
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
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
