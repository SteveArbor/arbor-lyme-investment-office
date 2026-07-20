import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { composeAppServices } from "@/application/services";
import { cardClasses, inputClasses, labelClasses } from "@/components/ui/form-styles";
import {
  clickableRowClasses,
  tableBodyClasses,
  tableClasses,
  tableContainerClasses,
  TableEmptyState,
  tableHeadClasses,
} from "@/components/ui/table";
import { NotFoundError } from "@/domain/shared";
import type { TransactionType } from "@/domain/trading";
import { computeTransactionsWithRunningBalance, TRANSACTION_TYPE_OPTIONS } from "@/domain/trading";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { formatCurrency, formatDate } from "@/lib/format";

import { TransactionForms } from "./transaction-forms";

export const metadata: Metadata = {
  title: "Transactions — Arbor Lyme Capital",
};

const PAGE_SIZE = 20;

const TYPE_LABELS: Record<TransactionType, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  fee: "Fee",
  interest: "Interest",
  tax: "Tax",
  cash_adjustment: "Cash adjustment",
};

function parsePage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function TransactionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { portfolioService, tradingService, companyService, settingsService } =
    composeAppServices(supabase);

  let portfolio;
  try {
    portfolio = await portfolioService.getPortfolio(user!.id, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const type =
    query.type && (TRANSACTION_TYPE_OPTIONS as readonly string[]).includes(query.type)
      ? (query.type as TransactionType)
      : undefined;
  const companyId = query.companyId || undefined;
  const from = query.from || undefined;
  const to = query.to || undefined;
  const sortDirection = query.sort === "asc" ? "asc" : "desc";
  const page = parsePage(query.page);

  const [allTransactions, page1, companies, settings] = await Promise.all([
    // Full, unfiltered history — required so "balance after" reflects every
    // cash-affecting transaction, not just the ones the current filter
    // shows (domain/trading/model.ts computeTransactionsWithRunningBalance).
    tradingService.listTransactions(user!.id, id),
    tradingService.listTransactionsFiltered(user!.id, id, {
      type,
      companyId,
      from,
      to,
      sortDirection,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }),
    companyService.listCompanies(user!.id),
    settingsService.getSettings(user!.id),
  ]);

  const companyNameById = new Map(companies.map((company) => [company.id, company.name]));
  const balanceById = new Map(
    computeTransactionsWithRunningBalance(portfolio.cash, allTransactions).map(
      ({ transaction, balanceAfter }) => [transaction.id, balanceAfter]
    )
  );

  const totalPages = Math.max(1, Math.ceil(page1.totalCount / PAGE_SIZE));
  const currency = settings.baseCurrency;

  function pageHref(targetPage: number): string {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (companyId) params.set("companyId", companyId);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (sortDirection === "asc") params.set("sort", "asc");
    if (targetPage > 1) params.set("page", String(targetPage));
    const qs = params.toString();
    return `/portfolio/${id}/transactions${qs ? `?${qs}` : ""}`;
  }

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-sm">
        <Link
          href={`/portfolio/${id}`}
          className="text-neutral-600 hover:underline dark:text-neutral-400"
        >
          ← {portfolio.name}
        </Link>
      </p>
      <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        Transactions — {portfolio.name}
      </h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Append-only ledger. Average cost, current holding, and realised gain are calculated
        automatically. Cash balances are database-authoritative — never client supplied.
      </p>

      <div className={`${cardClasses} mt-6`}>
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Record a transaction
        </h2>
        <div className="mt-4">
          <TransactionForms
            portfolioId={id}
            companies={companies}
            currentCash={portfolio.cash}
            currency={currency}
          />
        </div>
      </div>

      <h2 className="mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-100">History</h2>

      <form
        method="get"
        className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-4 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div>
          <label htmlFor="type" className={labelClasses}>
            Type
          </label>
          <select id="type" name="type" defaultValue={type ?? ""} className={inputClasses}>
            <option value="">All types</option>
            {TRANSACTION_TYPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {TYPE_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="companyId" className={labelClasses}>
            Company
          </label>
          <select
            id="companyId"
            name="companyId"
            defaultValue={companyId ?? ""}
            className={inputClasses}
          >
            <option value="">All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="from" className={labelClasses}>
            From
          </label>
          <input
            id="from"
            name="from"
            type="date"
            defaultValue={from ?? ""}
            className={inputClasses}
          />
        </div>
        <div>
          <label htmlFor="to" className={labelClasses}>
            To
          </label>
          <input id="to" name="to" type="date" defaultValue={to ?? ""} className={inputClasses} />
        </div>
        <div>
          <label htmlFor="sort" className={labelClasses}>
            Sort
          </label>
          <select id="sort" name="sort" defaultValue={sortDirection} className={inputClasses}>
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
        </div>
        <div className="flex items-end gap-2 sm:col-span-3">
          <button type="submit" className={inputClasses.replace("mt-1 ", "") + " w-auto px-4"}>
            Apply filters
          </button>
          <Link
            href={`/portfolio/${id}/transactions`}
            className="text-sm text-neutral-600 hover:underline dark:text-neutral-400"
          >
            Clear filters
          </Link>
        </div>
      </form>

      {page1.transactions.length === 0 ? (
        <div className="mt-4">
          <TableEmptyState message="No transactions match these filters." />
        </div>
      ) : (
        <div className={`mt-4 ${tableContainerClasses}`}>
          <table className={tableClasses}>
            <thead className={tableHeadClasses}>
              <tr>
                <th scope="col" className="px-4 py-3">
                  Date
                </th>
                <th scope="col" className="px-4 py-3">
                  Type
                </th>
                <th scope="col" className="px-4 py-3">
                  Company
                </th>
                <th scope="col" className="px-4 py-3">
                  Details
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Amount
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Balance after
                </th>
                <th scope="col" className="px-4 py-3">
                  Reference
                </th>
              </tr>
            </thead>
            <tbody className={tableBodyClasses}>
              {page1.transactions.map((transaction) => (
                <tr key={transaction.id} className={clickableRowClasses}>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    <Link
                      href={`/portfolio/${id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {formatDate(transaction.occurredAt)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/portfolio/${id}/transactions/${transaction.id}`}
                      className="block font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      {TYPE_LABELS[transaction.type]}
                      {transaction.category ? (
                        <span className="ml-1 font-normal text-neutral-500 capitalize">
                          ({transaction.category})
                        </span>
                      ) : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    <Link
                      href={`/portfolio/${id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {transaction.companyId
                        ? (companyNameById.get(transaction.companyId) ?? transaction.companyId)
                        : "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    <Link
                      href={`/portfolio/${id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {transaction.quantity !== null
                        ? `${transaction.quantity} @ ${formatCurrency(transaction.pricePerUnit ?? 0, currency)}`
                        : (transaction.notes ?? "—")}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">
                    <Link
                      href={`/portfolio/${id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {formatCurrency(transaction.amount, currency)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                    <Link
                      href={`/portfolio/${id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {formatCurrency(balanceById.get(transaction.id) ?? 0, currency)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    <Link
                      href={`/portfolio/${id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {transaction.reference ?? "—"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="Transaction history pages"
          className="mt-4 flex items-center justify-between text-sm"
        >
          <span className="text-neutral-600 dark:text-neutral-400">
            Page {page} of {totalPages} ({page1.totalCount} transactions)
          </span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-900 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                Previous
              </Link>
            ) : null}
            {page < totalPages ? (
              <Link
                href={pageHref(page + 1)}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-neutral-900 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </main>
  );
}
