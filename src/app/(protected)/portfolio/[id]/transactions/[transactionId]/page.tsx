import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { composeAppServices } from "@/application/services";
import { cardClasses } from "@/components/ui/form-styles";
import { NotFoundError } from "@/domain/shared";
import type { TransactionType } from "@/domain/trading";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { formatCurrency, formatDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Transaction detail — Arbor Lyme Capital",
};

const TYPE_LABELS: Record<TransactionType, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  fee: "Fee",
  interest: "Interest",
  tax: "Tax",
  cash_adjustment: "Cash adjustment",
};

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string; transactionId: string }>;
}) {
  const { id, transactionId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { portfolioService, tradingService, companyService, settingsService, auditService } =
    composeAppServices(supabase);

  let portfolio;
  let transaction;
  try {
    [portfolio, transaction] = await Promise.all([
      portfolioService.getPortfolio(user!.id, id),
      tradingService.getTransaction(user!.id, transactionId),
    ]);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  if (transaction.portfolioId !== id) notFound();

  const [company, settings, auditHistory] = await Promise.all([
    transaction.companyId ? companyService.getCompany(user!.id, transaction.companyId) : null,
    settingsService.getSettings(user!.id),
    auditService.getHistory(user!.id, "transaction", transactionId),
  ]);
  const currency = settings.baseCurrency;

  return (
    <main id="main-content" className="mx-auto max-w-3xl px-4 py-8">
      <p className="text-sm">
        <Link
          href={`/portfolio/${id}/transactions`}
          className="text-neutral-600 hover:underline dark:text-neutral-400"
        >
          ← Transactions — {portfolio.name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        {TYPE_LABELS[transaction.type]}
        {transaction.category ? (
          <span className="ml-2 text-lg font-normal text-neutral-500 capitalize">
            ({transaction.category})
          </span>
        ) : null}
      </h1>

      <div className={`${cardClasses} mt-6`}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Date</dt>
            <dd className="mt-1 text-neutral-900 dark:text-neutral-100">
              {formatDateTime(transaction.occurredAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Amount</dt>
            <dd className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
              {formatCurrency(transaction.amount, currency)}
            </dd>
          </div>
          {company ? (
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Company
              </dt>
              <dd className="mt-1">
                <Link
                  href={`/companies/${company.id}`}
                  className="text-neutral-900 hover:underline dark:text-neutral-100"
                >
                  {company.name} ({company.ticker})
                </Link>
              </dd>
            </div>
          ) : null}
          {transaction.quantity !== null ? (
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Quantity
              </dt>
              <dd className="mt-1 text-neutral-900 dark:text-neutral-100">
                {transaction.quantity}
              </dd>
            </div>
          ) : null}
          {transaction.pricePerUnit !== null ? (
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Price per unit
              </dt>
              <dd className="mt-1 text-neutral-900 dark:text-neutral-100">
                {formatCurrency(transaction.pricePerUnit, currency)}
              </dd>
            </div>
          ) : null}
          {transaction.realisedGain !== null ? (
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Realised gain
              </dt>
              <dd
                className={`mt-1 font-medium ${transaction.realisedGain >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
              >
                {formatCurrency(transaction.realisedGain, currency)}
              </dd>
            </div>
          ) : null}
          {transaction.reference ? (
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                External reference
              </dt>
              <dd className="mt-1 text-neutral-900 dark:text-neutral-100">
                {transaction.reference}
              </dd>
            </div>
          ) : null}
          <div>
            <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
              Recorded at
            </dt>
            <dd className="mt-1 text-neutral-900 dark:text-neutral-100">
              {formatDateTime(transaction.createdAt)}
            </dd>
          </div>
          {transaction.notes ? (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                Notes
              </dt>
              <dd className="mt-1 text-neutral-900 dark:text-neutral-100">{transaction.notes}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        Audit history
      </h2>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        This ledger entry is append-only — it is never edited or deleted. A correction is recorded
        as a new, separate transaction.
      </p>
      {auditHistory.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          No audit events recorded for this transaction yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {auditHistory.map((entry, index) => (
            <div key={`${entry.eventType}-${entry.occurredAt}-${index}`} className={cardClasses}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {entry.eventType}
                </span>
                <span className="text-sm text-neutral-600 dark:text-neutral-400">
                  {formatDateTime(entry.occurredAt)}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Outcome: {entry.outcome}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
