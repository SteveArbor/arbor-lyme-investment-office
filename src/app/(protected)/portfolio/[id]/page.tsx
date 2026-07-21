import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  buildPortfolioPerformanceData,
  buildPortfolioValuation,
  type CompanyLookup,
  composeAppServices,
} from "@/application/services";
import { primaryButtonClasses } from "@/components/ui/form-styles";
import { NotFoundError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { PortfolioPerformancePanel } from "./portfolio-performance-panel";

export const metadata: Metadata = {
  title: "Portfolio — Arbor Lyme Capital",
};

export default async function PortfolioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    portfolioService,
    tradingService,
    companyService,
    decisionService,
    settingsService,
    quoteRepository,
    fxRateRepository,
  } = composeAppServices(supabase);

  let portfolio;
  let companies;
  let performanceData;
  let settings;
  try {
    [portfolio, companies, performanceData, settings] = await Promise.all([
      portfolioService.getPortfolio(user!.id, id),
      companyService.listCompanies(user!.id),
      buildPortfolioPerformanceData(
        { portfolioService, tradingService, decisionService },
        user!.id,
        id
      ),
      settingsService.getSettings(user!.id),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const baseCurrency = settings.baseCurrency;
  const companyById = new Map(companies.map((company) => [company.id, company]));
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

  // Every exchange-traded (non-fund) holding's persisted quote (ADR
  // 0030/0031) — funds are never looked up here, matching
  // buildPortfolioValuation's own "no quote lookup for funds" rule.
  const exchangeTradedIdentifiers = performanceData.holdings
    .map((holding) => companyById.get(holding.companyId))
    .filter((company): company is NonNullable<typeof company> => company !== undefined)
    .filter((company) => company.securityType !== "fund")
    .map((company) => ({
      type: company.securityType,
      ticker: company.ticker,
      exchange: company.exchange,
      currency: company.currency,
    }));
  const quotes = await quoteRepository.getLatestForMany(user!.id, exchangeTradedIdentifiers);

  // FX conversion (ADR 0032): only the currencies this portfolio's
  // holdings actually trade in, other than the base currency itself —
  // GBP→GBP is identity and never needs a stored rate.
  const heldCurrencies = new Set(companies.map((company) => company.currency));
  const fxPairs = [...heldCurrencies]
    .filter((currency) => currency !== baseCurrency)
    .map((currency) => ({ base: currency, quote: baseCurrency }));
  const fxRates = await fxRateRepository.getLatestForMany(user!.id, fxPairs);

  const now = new Date().toISOString();
  const valuation = buildPortfolioValuation(
    performanceData,
    companyLookupById,
    quotes,
    fxRates,
    baseCurrency,
    now
  );

  return (
    <main id="main-content" className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-sm">
        <Link href="/portfolio" className="text-neutral-600 hover:underline dark:text-neutral-400">
          ← All portfolios
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          {portfolio.name}
        </h1>
        <Link href={`/portfolio/${id}/transactions`} className={primaryButtonClasses}>
          Record transaction
        </Link>
      </div>

      <div className="mt-6">
        <PortfolioPerformancePanel
          portfolioId={id}
          baseCurrency={baseCurrency}
          valuation={valuation}
        />
      </div>
    </main>
  );
}
