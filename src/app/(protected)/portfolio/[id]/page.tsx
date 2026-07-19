import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { composeAppServices } from "@/application/services";
import { cardClasses, primaryButtonClasses } from "@/components/ui/form-styles";
import { NotFoundError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";

export const metadata: Metadata = {
  title: "Portfolio — Arbor Lyme Capital",
};

export default async function PortfolioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { portfolioService, companyService } = composeAppServices(supabase);

  let portfolio;
  try {
    portfolio = await portfolioService.getPortfolio(user!.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const holdings = await portfolioService.listHoldings(user!.id, id);
  const companies = await Promise.all(
    holdings.map((holding) => companyService.getCompany(user!.id, holding.companyId))
  );
  const holdingsValue = holdings.reduce(
    (sum, holding) => sum + holding.quantity * holding.averageCost,
    0
  );

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
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

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={cardClasses}>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Cash</p>
          <p className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {portfolio.cash.toFixed(2)}
          </p>
        </div>
        <div className={cardClasses}>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Holdings (at cost)
          </p>
          <p className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {holdingsValue.toFixed(2)}
          </p>
        </div>
        <div className={cardClasses}>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Total (at cost)
          </p>
          <p className="mt-1 text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {(portfolio.cash + holdingsValue).toFixed(2)}
          </p>
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        Holdings
      </h2>
      {holdings.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          No open positions. Record a buy transaction to start one.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium tracking-wide text-neutral-600 uppercase dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Average cost</th>
                <th className="px-4 py-3">Cost basis</th>
                <th className="px-4 py-3">Target allocation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {holdings.map((holding, index) => (
                <tr key={holding.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/companies/${holding.companyId}`}
                      className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                    >
                      {companies[index]?.name ?? holding.companyId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {holding.quantity}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {holding.averageCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {(holding.quantity * holding.averageCost).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {(holding.targetAllocationPercent * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
