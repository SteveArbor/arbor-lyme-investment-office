import type { Metadata } from "next";

import { composeAppServices } from "@/application/services";
import { cardClasses } from "@/components/ui/form-styles";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { TransactionForms } from "./transaction-forms";

export const metadata: Metadata = {
  title: "Transactions — Arbor Lyme Capital",
};

export default async function TransactionsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { portfolioService, tradingService, companyService } = composeAppServices(supabase);
  const portfolios = await portfolioService.listPortfolios(user!.id);

  if (portfolios.length === 0) {
    return (
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Transactions
        </h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Create a portfolio first.
        </p>
      </main>
    );
  }

  const portfolio = portfolios[0];
  const [transactions, companies] = await Promise.all([
    tradingService.listTransactions(user!.id, portfolio.id),
    companyService.listCompanies(user!.id),
  ]);
  const companyNameById = new Map(companies.map((company) => [company.id, company.name]));

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        Transactions — {portfolio.name}
      </h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Append-only ledger. Average cost, current holding, and realised gain are calculated
        automatically.
      </p>

      <div className="mt-6">
        <TransactionForms portfolioId={portfolio.id} companies={companies} />
      </div>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-100">History</h2>
      {transactions.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">No transactions yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {transactions.map((transaction) => (
            <div key={transaction.id} className={cardClasses}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-neutral-900 capitalize dark:text-neutral-100">
                  {transaction.type.replace("_", " ")}
                  {transaction.companyId
                    ? ` — ${companyNameById.get(transaction.companyId) ?? transaction.companyId}`
                    : ""}
                </span>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {new Date(transaction.occurredAt).toLocaleDateString()}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {transaction.quantity !== null
                  ? `${transaction.quantity} @ ${transaction.pricePerUnit} — `
                  : ""}
                Amount: {transaction.amount.toFixed(2)}
                {transaction.realisedGain !== null
                  ? ` — Realised gain: ${transaction.realisedGain.toFixed(2)}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
