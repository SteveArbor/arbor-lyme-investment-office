import type { Metadata } from "next";
import Link from "next/link";

import { composeAppServices } from "@/application/services";
import {
  clickableRowClasses,
  tableBodyClasses,
  tableClasses,
  tableContainerClasses,
  TableEmptyState,
  tableHeadClasses,
} from "@/components/ui/table";
import type { TransactionType } from "@/domain/trading";
import { createSupabaseServerClient } from "@/infrastructure/auth";
import { formatCurrency, formatDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Transactions — Arbor Lyme Capital",
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

export default async function CompanyTransactionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { portfolioService, tradingService, settingsService } = composeAppServices(supabase);

  const [portfolios, settings] = await Promise.all([
    portfolioService.listPortfolios(user!.id),
    settingsService.getSettings(user!.id),
  ]);

  const byPortfolio = await Promise.all(
    portfolios.map(async (portfolio) => ({
      portfolio,
      transactions: await tradingService.listTransactionsForCompany(user!.id, portfolio.id, id),
    }))
  );

  const rows = byPortfolio
    .flatMap(({ portfolio, transactions }) =>
      transactions.map((transaction) => ({ portfolio, transaction }))
    )
    .sort((a, b) => (a.transaction.occurredAt < b.transaction.occurredAt ? 1 : -1));

  const currency = settings.baseCurrency;

  return (
    <div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Every buy, sell, dividend, fee, and tax transaction recorded against this company, across
        every portfolio. Recorded from the portfolio&rsquo;s own Transactions page.
      </p>

      {rows.length === 0 ? (
        <div className="mt-4">
          <TableEmptyState message="No transactions recorded for this company yet." />
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
                  Portfolio
                </th>
                <th scope="col" className="px-4 py-3">
                  Details
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className={tableBodyClasses}>
              {rows.map(({ portfolio, transaction }) => (
                <tr key={transaction.id} className={clickableRowClasses}>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    <Link
                      href={`/portfolio/${portfolio.id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {formatDate(transaction.occurredAt)}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/portfolio/${portfolio.id}/transactions/${transaction.id}`}
                      className="block font-medium text-neutral-900 dark:text-neutral-100"
                    >
                      {TYPE_LABELS[transaction.type]}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    <Link href={`/portfolio/${portfolio.id}`} className="block hover:underline">
                      {portfolio.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    <Link
                      href={`/portfolio/${portfolio.id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {transaction.quantity !== null
                        ? `${transaction.quantity} @ ${formatCurrency(transaction.pricePerUnit ?? 0, currency)}`
                        : (transaction.notes ?? "—")}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">
                    <Link
                      href={`/portfolio/${portfolio.id}/transactions/${transaction.id}`}
                      className="block"
                    >
                      {formatCurrency(transaction.amount, currency)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
