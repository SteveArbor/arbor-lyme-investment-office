import type { Metadata } from "next";
import Link from "next/link";

import { composeAppServices } from "@/application/services";
import { cardClasses } from "@/components/ui/form-styles";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { CreatePortfolioForm } from "./create-portfolio-form";

export const metadata: Metadata = {
  title: "Portfolios — Arbor Lyme Capital",
};

export default async function PortfoliosPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { portfolioService } = composeAppServices(supabase);
  const portfolios = await portfolioService.listPortfolios(user!.id);

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Portfolios
        </h1>
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Holdings, cash, and transactions are scoped to a portfolio — create as many as you keep
        separately (e.g. by account or strategy).
      </p>

      {portfolios.length > 0 ? (
        <div className="mt-6 space-y-2">
          {portfolios.map((portfolio) => (
            <Link
              key={portfolio.id}
              href={`/portfolio/${portfolio.id}`}
              className={`${cardClasses} block hover:border-neutral-400 dark:hover:border-neutral-600`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {portfolio.name}
                </span>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  Cash: {portfolio.cash.toFixed(2)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-8">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          {portfolios.length > 0 ? "Create another portfolio" : "Create your first portfolio"}
        </h2>
        <div className="mt-3">
          <CreatePortfolioForm />
        </div>
      </div>
    </main>
  );
}
