"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { cardClasses, inputClasses } from "@/components/ui/form-styles";
import {
  tableBodyClasses,
  tableClasses,
  tableContainerClasses,
  TableEmptyState,
  tableHeadClasses,
} from "@/components/ui/table";
import type { InvestmentRating } from "@/domain/decision";
import {
  calculatePortfolioPerformance,
  type CashFlow,
  type HoldingPerformance,
} from "@/domain/portfolio";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClasses,
} from "@/lib/format";

export interface PerformanceHoldingRow {
  companyId: string;
  companyName: string;
  ticker: string;
  quantity: number;
  averageCost: number;
  targetAllocationPercent: number;
  investmentRating: InvestmentRating | null;
  lastUpdated: string;
}

const RATING_LABELS: Record<InvestmentRating, string> = {
  exceptional: "Exceptional",
  strong_buy: "Strong buy",
  buy: "Buy",
  hold: "Hold",
  reduce_conviction: "Reduce conviction",
  sell: "Sell",
  avoid: "Avoid",
};

type SortKey =
  | "company"
  | "marketValue"
  | "unrealisedGain"
  | "unrealisedGainPercent"
  | "allocationPercent"
  | "allocationDifferencePercent";

function SummaryCard({
  label,
  value,
  valueClassName = "text-neutral-900 dark:text-neutral-100",
  subValue,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  subValue?: string;
}) {
  return (
    <div className={cardClasses}>
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${valueClassName}`}>{value}</p>
      {subValue ? (
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{subValue}</p>
      ) : null}
    </div>
  );
}

function SortButton({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: "asc" | "desc";
  onClick: (key: SortKey) => void;
}) {
  const isActive = activeKey === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className="flex items-center gap-1 hover:text-neutral-900 focus:outline-none dark:hover:text-neutral-100"
      aria-label={`Sort by ${label}`}
    >
      {label}
      {isActive ? <span aria-hidden="true">{direction === "asc" ? "▲" : "▼"}</span> : null}
    </button>
  );
}

export function PortfolioPerformancePanel({
  portfolioId,
  currency,
  cash,
  holdingRows,
  realisedGainTotal,
  dividendsReceived,
  feesPaid,
  taxesPaid,
  netContributions,
  cashFlows,
}: {
  portfolioId: string;
  currency: string;
  cash: number;
  holdingRows: PerformanceHoldingRow[];
  realisedGainTotal: number;
  dividendsReceived: number;
  feesPaid: number;
  taxesPaid: number;
  netContributions: number;
  cashFlows: CashFlow[];
}) {
  const [prices, setPrices] = useState<Record<string, number>>(() =>
    Object.fromEntries(holdingRows.map((row) => [row.companyId, row.averageCost]))
  );
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  }

  const performance = useMemo(() => {
    const holdingsInput = holdingRows.map((row) => ({
      companyId: row.companyId,
      quantity: row.quantity,
      averageCost: row.averageCost,
      currentPrice: prices[row.companyId] ?? row.averageCost,
      targetAllocationPercent: row.targetAllocationPercent,
    }));
    const marketValue = holdingsInput.reduce((sum, h) => sum + h.quantity * h.currentPrice, 0);
    const totalValue = marketValue + cash;
    const cashFlowsWithTerminal: CashFlow[] = [
      ...cashFlows,
      { date: new Date().toISOString(), amount: totalValue },
    ];

    return calculatePortfolioPerformance({
      cash,
      holdings: holdingsInput,
      realisedGainTotal,
      dividendsReceived,
      feesPaid,
      taxesPaid,
      netContributions,
      cashFlows: cashFlowsWithTerminal,
    });
  }, [
    holdingRows,
    prices,
    cash,
    realisedGainTotal,
    dividendsReceived,
    feesPaid,
    taxesPaid,
    netContributions,
    cashFlows,
  ]);

  const holdingByCompanyId = useMemo(
    () => new Map(holdingRows.map((row) => [row.companyId, row])),
    [holdingRows]
  );

  const sortedHoldings = useMemo(() => {
    const rows = [...performance.holdings];
    const factor = sortDirection === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "company": {
          const nameA = holdingByCompanyId.get(a.companyId)?.companyName ?? "";
          const nameB = holdingByCompanyId.get(b.companyId)?.companyName ?? "";
          return factor * nameA.localeCompare(nameB);
        }
        case "unrealisedGain":
          return factor * (a.unrealisedGain - b.unrealisedGain);
        case "unrealisedGainPercent":
          return factor * (a.unrealisedGainPercent - b.unrealisedGainPercent);
        case "allocationPercent":
          return factor * (a.allocationPercent - b.allocationPercent);
        case "allocationDifferencePercent":
          return factor * (a.allocationDifferencePercent - b.allocationDifferencePercent);
        case "marketValue":
        default:
          return factor * (a.marketValue - b.marketValue);
      }
    });
    return rows;
  }, [performance.holdings, sortKey, sortDirection, holdingByCompanyId]);

  function holdingLabel(holding: HoldingPerformance | null): string {
    if (!holding) return "—";
    const row = holdingByCompanyId.get(holding.companyId);
    return row ? `${row.companyName} (${row.ticker})` : holding.companyId;
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total portfolio value"
          value={formatCurrency(performance.totalValue, currency)}
        />
        <SummaryCard label="Cash" value={formatCurrency(performance.cash, currency)} />
        <SummaryCard
          label="Market value (holdings)"
          value={formatCurrency(performance.marketValue, currency)}
          subValue={`Cost basis ${formatCurrency(performance.costBasis, currency)}`}
        />
        <SummaryCard
          label="Unrealised gain"
          value={formatSignedCurrency(performance.unrealisedGain, currency)}
          valueClassName={gainLossClasses(performance.unrealisedGain)}
          subValue={formatSignedPercent(performance.unrealisedGainPercent)}
        />
        <SummaryCard
          label="Realised gain"
          value={formatSignedCurrency(performance.realisedGain, currency)}
          valueClassName={gainLossClasses(performance.realisedGain)}
        />
        <SummaryCard
          label="Total return"
          value={formatSignedCurrency(performance.totalReturn, currency)}
          valueClassName={gainLossClasses(performance.totalReturn)}
          subValue={formatSignedPercent(performance.totalReturnPercent)}
        />
        <SummaryCard
          label="Money-weighted return"
          value={
            performance.moneyWeightedReturn !== null
              ? formatSignedPercent(performance.moneyWeightedReturn)
              : "Not enough history"
          }
          valueClassName={
            performance.moneyWeightedReturn !== null
              ? gainLossClasses(performance.moneyWeightedReturn)
              : undefined
          }
          subValue="XIRR, annualised"
        />
        <SummaryCard
          label="Average holding cost"
          value={formatCurrency(performance.averageHoldingCost, currency)}
        />
        <SummaryCard
          label="Dividends received"
          value={formatCurrency(performance.dividendsReceived, currency)}
        />
        <SummaryCard label="Fees paid" value={formatCurrency(performance.feesPaid, currency)} />
        <SummaryCard label="Taxes paid" value={formatCurrency(performance.taxesPaid, currency)} />
        <SummaryCard label="Largest position" value={holdingLabel(performance.largestPosition)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={cardClasses}>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Largest gain
          </p>
          <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400">
            {holdingLabel(performance.largestGain)}
            {performance.largestGain
              ? ` — ${formatSignedCurrency(performance.largestGain.unrealisedGain, currency)}`
              : ""}
          </p>
        </div>
        <div className={cardClasses}>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Largest loss
          </p>
          <p className="mt-1 font-semibold text-red-700 dark:text-red-400">
            {holdingLabel(performance.largestLoss)}
            {performance.largestLoss
              ? ` — ${formatSignedCurrency(performance.largestLoss.unrealisedGain, currency)}`
              : ""}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Holdings</h2>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No market-data provider is connected — enter current prices below to see live performance.
          Prices are not saved.
        </p>
      </div>

      {sortedHoldings.length === 0 ? (
        <div className="mt-3">
          <TableEmptyState message="No open positions. Record a buy transaction to start one." />
        </div>
      ) : (
        <div className={`mt-3 ${tableContainerClasses}`}>
          <table className={tableClasses}>
            <thead className={tableHeadClasses}>
              <tr>
                <th scope="col" className="px-4 py-3">
                  <SortButton
                    label="Company"
                    sortKey="company"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th scope="col" className="px-4 py-3">
                  Quantity
                </th>
                <th scope="col" className="px-4 py-3">
                  Avg cost
                </th>
                <th scope="col" className="px-4 py-3">
                  Current price
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <SortButton
                    label="Market value"
                    sortKey="marketValue"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <SortButton
                    label="Unrealised gain"
                    sortKey="unrealisedGain"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <SortButton
                    label="Return %"
                    sortKey="unrealisedGainPercent"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <SortButton
                    label="Allocation"
                    sortKey="allocationPercent"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Target
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <SortButton
                    label="Difference"
                    sortKey="allocationDifferencePercent"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
                </th>
                <th scope="col" className="px-4 py-3">
                  Rating
                </th>
                <th scope="col" className="px-4 py-3">
                  Last updated
                </th>
              </tr>
            </thead>
            <tbody className={tableBodyClasses}>
              {sortedHoldings.map((holding) => {
                const row = holdingByCompanyId.get(holding.companyId);
                if (!row) return null;
                return (
                  <tr
                    key={holding.companyId}
                    className="transition hover:bg-neutral-50 dark:hover:bg-neutral-900"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/companies/${holding.companyId}`}
                        className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                      >
                        {row.companyName}
                      </Link>
                      <span className="ml-1 text-neutral-500">({row.ticker})</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {holding.quantity}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {formatCurrency(holding.averageCost, currency)}
                    </td>
                    <td className="px-4 py-3">
                      <label className="sr-only" htmlFor={`price-${holding.companyId}`}>
                        Current price for {row.companyName}
                      </label>
                      <input
                        id={`price-${holding.companyId}`}
                        type="number"
                        step="0.000001"
                        min="0"
                        value={prices[holding.companyId] ?? row.averageCost}
                        onChange={(event) => {
                          const parsed = Number(event.target.value);
                          setPrices((current) => ({
                            ...current,
                            [holding.companyId]: Number.isFinite(parsed) ? parsed : 0,
                          }));
                        }}
                        className={`${inputClasses} mt-0 w-28`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">
                      {formatCurrency(holding.marketValue, currency)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${gainLossClasses(holding.unrealisedGain)}`}
                    >
                      {formatSignedCurrency(holding.unrealisedGain, currency)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${gainLossClasses(holding.unrealisedGain)}`}
                    >
                      {formatSignedPercent(holding.unrealisedGainPercent)}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                      {formatPercent(holding.allocationPercent)}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                      {formatPercent(holding.targetAllocationPercent)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        Math.abs(holding.allocationDifferencePercent) < 0.001
                          ? "text-neutral-600 dark:text-neutral-400"
                          : gainLossClasses(-Math.abs(holding.allocationDifferencePercent))
                      }`}
                    >
                      {formatSignedPercent(holding.allocationDifferencePercent)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {row.investmentRating ? RATING_LABELS[row.investmentRating] : "—"}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {formatDate(row.lastUpdated)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-sm">
        <Link
          href={`/portfolio/${portfolioId}/transactions`}
          className="text-neutral-600 hover:underline dark:text-neutral-400"
        >
          View all transactions →
        </Link>
      </p>
    </div>
  );
}
