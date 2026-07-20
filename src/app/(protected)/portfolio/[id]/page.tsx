import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { buildPortfolioPerformanceData, composeAppServices } from "@/application/services";
import { primaryButtonClasses } from "@/components/ui/form-styles";
import { NotFoundError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { type PerformanceHoldingRow, PortfolioPerformancePanel } from "./portfolio-performance-panel";

export const metadata: Metadata = {
  title: "Portfolio — Arbor Lyme Capital",
};

export default async function PortfolioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { portfolioService, tradingService, companyService, decisionService, settingsService } =
    composeAppServices(supabase);

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
  const companyById = new Map(companies.map((company) => [company.id, company]));

  const holdingRows: PerformanceHoldingRow[] = performanceData.holdings.map((holding) => {
    const company = companyById.get(holding.companyId);
    return {
      companyId: holding.companyId,
      companyName: company?.name ?? holding.companyId,
      ticker: company?.ticker ?? "—",
      quantity: holding.quantity,
      averageCost: holding.averageCost,
      targetAllocationPercent: holding.targetAllocationPercent,
      investmentRating: holding.investmentRating,
      lastUpdated: holding.lastUpdated,
    };
  });

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
          currency={settings.baseCurrency}
          cash={performanceData.cash}
          holdingRows={holdingRows}
          realisedGainTotal={performanceData.realisedGainTotal}
          dividendsReceived={performanceData.dividendsReceived}
          feesPaid={performanceData.feesPaid}
          taxesPaid={performanceData.taxesPaid}
          netContributions={performanceData.netContributions}
          cashFlows={performanceData.cashFlows}
        />
      </div>
    </main>
  );
}
