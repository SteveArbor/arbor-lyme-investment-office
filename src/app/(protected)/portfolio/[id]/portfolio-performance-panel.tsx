"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import type {
  FxRefreshResult,
  HoldingValuation,
  PortfolioValuation,
  PriceRefreshResult,
  RefreshableSecurity,
} from "@/application/services";
import { cardClasses, inputClasses, secondaryButtonClasses } from "@/components/ui/form-styles";
import {
  tableBodyClasses,
  tableClasses,
  tableContainerClasses,
  TableEmptyState,
  tableHeadClasses,
} from "@/components/ui/table";
import type { InvestmentRating } from "@/domain/decision";
import { buildFxPairKey, type FxRate, type PriceQuality, type PriceQuote } from "@/domain/market";
import { calculatePortfolioPerformance, type HoldingPerformance } from "@/domain/portfolio";
import {
  formatCurrency,
  formatDate,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClasses,
} from "@/lib/format";

import { refreshMarketDataAction, saveManualPriceAction } from "./price-refresh-actions";

const QUALITY_LABELS: Record<PriceQuality, string> = {
  real_time: "Real-time",
  delayed: "Delayed",
  previous_close: "Previous close",
  manual: "Manual",
};

function formatAge(ageSeconds: number): string {
  if (ageSeconds < 60) return "just now";
  const minutes = Math.round(ageSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
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
  | "dailyChange"
  | "allocationPercent"
  | "allocationDifferencePercent";

/** A holding's price/quote fields, overridden client-side after a refresh or a manual save without waiting for a full server round trip. */
interface PriceOverride {
  price: number;
  currency: string;
  quality: PriceQuality;
  providerName: string;
  sourceTimestamp: string;
  previousClose?: number;
}

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

function outcomeSummary(quotes: PriceRefreshResult[], fxRates: FxRefreshResult[]): string {
  const count = (items: Array<{ outcome: string }>, outcome: string) =>
    items.filter((item) => item.outcome === outcome).length;
  const parts: string[] = [];
  const updated = count(quotes, "updated") + count(fxRates, "updated");
  const unchanged = count(quotes, "unchanged") + count(fxRates, "unchanged");
  const unsupported = count(quotes, "unsupported");
  const failed = count(quotes, "failed") + count(fxRates, "failed");
  if (updated > 0) parts.push(`${updated} updated`);
  if (unchanged > 0) parts.push(`${unchanged} unchanged`);
  if (unsupported > 0) parts.push(`${unsupported} manually priced`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.length > 0 ? parts.join(", ") : "Nothing to refresh";
}

export function PortfolioPerformancePanel({
  portfolioId,
  baseCurrency,
  valuation,
}: {
  portfolioId: string;
  baseCurrency: string;
  valuation: PortfolioValuation;
}) {
  const [priceOverrides, setPriceOverrides] = useState<Record<string, PriceOverride>>({});
  const [fxOverrides, setFxOverrides] = useState<Record<string, FxRate>>({});
  const [manualDrafts, setManualDrafts] = useState<Record<string, string>>({});
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [savingManual, startSavingManual] = useTransition();
  const [refreshSummary, setRefreshSummary] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [quoteErrorsByCompany, setQuoteErrorsByCompany] = useState<Record<string, string>>({});
  const [isRefreshing, startRefresh] = useTransition();
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const holdingByCompanyId = useMemo(
    () => new Map(valuation.holdings.map((h) => [h.companyId, h])),
    [valuation.holdings]
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  }

  const refreshableSecurities: RefreshableSecurity[] = valuation.holdings
    .filter((h) => h.securityType !== "fund" && h.exchange)
    .map((h) => ({
      companyId: h.companyId,
      ticker: h.ticker,
      exchange: h.exchange as string,
      currency: h.currency,
      securityType: h.securityType,
    }));

  function handleRefresh() {
    setRefreshError(null);
    setRefreshSummary(null);
    startRefresh(async () => {
      const result = await refreshMarketDataAction(
        portfolioId,
        refreshableSecurities,
        baseCurrency
      );
      if (result.error) setRefreshError(result.error);
      setRefreshSummary(outcomeSummary(result.quotes, result.fxRates));

      const newQuoteErrors: Record<string, string> = {};
      setPriceOverrides((current) => {
        const next = { ...current };
        for (const item of result.quotes) {
          if (item.quote && (item.outcome === "updated" || item.outcome === "unchanged")) {
            next[item.companyId] = {
              price: item.quote.price,
              currency: item.quote.currency,
              quality: item.quote.quality,
              providerName: item.quote.providerName,
              sourceTimestamp: item.quote.sourceTimestamp,
              previousClose: item.quote.previousClose,
            };
          }
          if (item.error) newQuoteErrors[item.companyId] = item.error;
        }
        return next;
      });
      setQuoteErrorsByCompany(newQuoteErrors);

      setFxOverrides((current) => {
        const next = { ...current };
        for (const item of result.fxRates) {
          if (item.rate) {
            next[buildFxPairKey(item.base, item.quote)] = item.rate;
          }
        }
        return next;
      });
    });
  }

  function handleSaveManualPrice(holding: HoldingValuation) {
    const draft = manualDrafts[holding.companyId];
    const parsed = draft !== undefined ? Number(draft) : NaN;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setManualErrors((current) => ({
        ...current,
        [holding.companyId]: "Enter a positive number.",
      }));
      return;
    }
    setManualErrors((current) => {
      const next = { ...current };
      delete next[holding.companyId];
      return next;
    });

    startSavingManual(async () => {
      const identifier =
        holding.securityType === "fund"
          ? { type: holding.securityType, sedol: holding.ticker, currency: holding.currency }
          : {
              type: holding.securityType,
              ticker: holding.ticker,
              exchange: holding.exchange ?? "",
              currency: holding.currency,
            };
      const result = await saveManualPriceAction(portfolioId, identifier, parsed);
      if (result.error) {
        setManualErrors((current) => ({ ...current, [holding.companyId]: result.error! }));
        return;
      }
      setPriceOverrides((current) => ({
        ...current,
        [holding.companyId]: {
          price: parsed,
          currency: holding.currency,
          quality: "manual",
          providerName: "manual",
          sourceTimestamp: new Date().toISOString(),
        },
      }));
      setManualDrafts((current) => {
        const next = { ...current };
        delete next[holding.companyId];
        return next;
      });
    });
  }

  const performance = useMemo(() => {
    const holdingsInput = valuation.holdings.map((h) => {
      const override = priceOverrides[h.companyId];
      const currency = override?.currency ?? h.performance.currency;
      const currentPrice = override?.price ?? h.performance.currentPrice;
      const fxOverride = fxOverrides[buildFxPairKey(currency, baseCurrency)];
      const fxRateToBase =
        currency === baseCurrency ? 1 : (fxOverride?.rate ?? h.performance.fxRateToBase);
      return {
        companyId: h.companyId,
        quantity: h.performance.quantity,
        averageCost: h.performance.averageCost,
        currentPrice,
        currency,
        fxRateToBase,
        previousClose: override?.previousClose ?? h.quote?.previousClose,
        targetAllocationPercent: h.targetAllocationPercent,
      };
    });
    const marketValue = holdingsInput.reduce(
      (sum, h) => sum + h.quantity * h.currentPrice * h.fxRateToBase,
      0
    );
    const totalValue = marketValue + valuation.performance.cash;
    const cashFlowsWithTerminal = [
      ...valuation.cashFlows,
      { date: new Date().toISOString(), amount: totalValue },
    ];

    return calculatePortfolioPerformance({
      cash: valuation.performance.cash,
      holdings: holdingsInput,
      realisedGainTotal: valuation.performance.realisedGain,
      dividendsReceived: valuation.performance.dividendsReceived,
      feesPaid: valuation.performance.feesPaid,
      taxesPaid: valuation.performance.taxesPaid,
      netContributions: valuation.netContributions,
      cashFlows: cashFlowsWithTerminal,
    });
  }, [valuation, priceOverrides, fxOverrides, baseCurrency]);

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
        case "dailyChange":
          return factor * ((a.dailyChangeAmountBase ?? 0) - (b.dailyChangeAmountBase ?? 0));
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
          value={formatCurrency(performance.totalValue, baseCurrency)}
        />
        <SummaryCard label="Cash" value={formatCurrency(performance.cash, baseCurrency)} />
        <SummaryCard
          label="Market value (holdings)"
          value={formatCurrency(performance.marketValue, baseCurrency)}
          subValue={`Cost basis ${formatCurrency(performance.costBasis, baseCurrency)}`}
        />
        <SummaryCard
          label="Unrealised gain"
          value={formatSignedCurrency(performance.unrealisedGain, baseCurrency)}
          valueClassName={gainLossClasses(performance.unrealisedGain)}
          subValue={formatSignedPercent(performance.unrealisedGainPercent)}
        />
        <SummaryCard
          label="Daily gain"
          value={
            performance.dailyGain !== null
              ? formatSignedCurrency(performance.dailyGain, baseCurrency)
              : "No live quotes"
          }
          valueClassName={
            performance.dailyGain !== null ? gainLossClasses(performance.dailyGain) : undefined
          }
          subValue={
            performance.dailyGainPercent !== null
              ? formatSignedPercent(performance.dailyGainPercent)
              : undefined
          }
        />
        <SummaryCard
          label="Realised gain"
          value={formatSignedCurrency(performance.realisedGain, baseCurrency)}
          valueClassName={gainLossClasses(performance.realisedGain)}
        />
        <SummaryCard
          label="Total return"
          value={formatSignedCurrency(performance.totalReturn, baseCurrency)}
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
          value={formatCurrency(performance.averageHoldingCost, baseCurrency)}
        />
        <SummaryCard
          label="Dividends received"
          value={formatCurrency(performance.dividendsReceived, baseCurrency)}
        />
        <SummaryCard label="Fees paid" value={formatCurrency(performance.feesPaid, baseCurrency)} />
        <SummaryCard
          label="Taxes paid"
          value={formatCurrency(performance.taxesPaid, baseCurrency)}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Largest position" value={holdingLabel(performance.largestPosition)} />
        <div className={cardClasses}>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Largest gain
          </p>
          <p className="mt-1 font-semibold text-emerald-700 dark:text-emerald-400">
            {holdingLabel(performance.largestGain)}
            {performance.largestGain
              ? ` — ${formatSignedCurrency(performance.largestGain.unrealisedGain, baseCurrency)}`
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
              ? ` — ${formatSignedCurrency(performance.largestLoss.unrealisedGain, baseCurrency)}`
              : ""}
          </p>
        </div>
        <div className={cardClasses}>
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
            Quote coverage
          </p>
          <p className="mt-1 font-semibold text-neutral-900 dark:text-neutral-100">
            {valuation.quoteCoverage.live} live · {valuation.quoteCoverage.manual} manual
            {valuation.quoteCoverage.stale > 0 ? (
              <span className="text-amber-700 dark:text-amber-500">
                {" "}
                · {valuation.quoteCoverage.stale} stale
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
            {valuation.lastMarketUpdate
              ? `Last market update ${formatDate(valuation.lastMarketUpdate)}`
              : "No live quotes yet"}
          </p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Holdings</h2>
        <div className="flex flex-wrap items-center gap-3">
          {refreshableSecurities.length > 0 ? (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={secondaryButtonClasses}
            >
              {isRefreshing ? "Refreshing…" : "Refresh prices"}
            </button>
          ) : null}
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            All values shown in {baseCurrency}. Manual prices are entered in each security&apos;s
            own currency.
          </p>
        </div>
      </div>
      {refreshError ? (
        <p className="mt-2 text-sm text-red-700 dark:text-red-400">{refreshError}</p>
      ) : null}
      {refreshSummary ? (
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{refreshSummary}</p>
      ) : null}

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
                  Avg cost ({baseCurrency})
                </th>
                <th scope="col" className="px-4 py-3">
                  Current price
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  <SortButton
                    label="Daily change"
                    sortKey="dailyChange"
                    activeKey={sortKey}
                    direction={sortDirection}
                    onClick={handleSort}
                  />
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
                const override = priceOverrides[holding.companyId];
                const displayQuote: PriceQuote["quality"] | undefined =
                  override?.quality ?? row.quote?.quality;
                const displayTimestamp = override?.sourceTimestamp ?? row.quote?.sourceTimestamp;
                const displayProvider = override?.providerName ?? row.quote?.providerName;
                // A client-side override was just fetched/saved this
                // session -- its age is "just now" by construction, same
                // as ADR 0031's original documented behaviour, avoiding an
                // impure Date.now() read during render. Without an
                // override, use the server-computed age (a stable `now`
                // captured once at the page's own render time).
                const ageSeconds = override ? 0 : (row.quote?.age.ageSeconds ?? null);
                const isStale = override ? false : (row.quote?.age.isStale ?? false);
                const isManualHolding =
                  row.securityType === "fund" ||
                  displayQuote === undefined ||
                  displayQuote === "manual";
                const draftValue = manualDrafts[holding.companyId];

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
                      {formatCurrency(holding.averageCost, baseCurrency)}
                    </td>
                    <td className="px-4 py-3">
                      {isManualHolding ? (
                        <div className="flex items-center gap-2">
                          <label className="sr-only" htmlFor={`price-${holding.companyId}`}>
                            Manual price for {row.companyName}
                          </label>
                          <input
                            id={`price-${holding.companyId}`}
                            type="number"
                            step="0.000001"
                            min="0"
                            placeholder={holding.currentPrice.toString()}
                            value={draftValue ?? ""}
                            onChange={(event) =>
                              setManualDrafts((current) => ({
                                ...current,
                                [holding.companyId]: event.target.value,
                              }))
                            }
                            className={`${inputClasses} mt-0 w-24`}
                          />
                          <span className="text-xs text-neutral-500">{row.currency}</span>
                          <button
                            type="button"
                            disabled={savingManual || draftValue === undefined}
                            onClick={() => handleSaveManualPrice(row)}
                            className="rounded-md border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <p className="text-neutral-900 dark:text-neutral-100">
                          {formatCurrency(holding.currentPrice, holding.currency)}
                          {holding.currency !== baseCurrency ? (
                            <span className="ml-1 text-xs text-neutral-500">
                              ({formatCurrency(holding.currentPriceBase, baseCurrency)})
                            </span>
                          ) : null}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                        {isManualHolding
                          ? "Manually priced"
                          : `${row.currency} · ${displayQuote ? QUALITY_LABELS[displayQuote] : "—"}`}
                      </p>
                      {displayTimestamp ? (
                        <p
                          className={`text-xs ${isStale ? "text-amber-700 dark:text-amber-500" : "text-neutral-500 dark:text-neutral-400"}`}
                        >
                          {displayProvider === "manual" ? "Set" : "Quoted"}{" "}
                          {formatAge(ageSeconds ?? 0)}
                          {isStale ? " · stale" : ""}
                        </p>
                      ) : (
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          No price recorded yet
                        </p>
                      )}
                      {row.fxRateMissing ? (
                        <p className="text-xs text-amber-700 dark:text-amber-500">
                          FX rate unavailable — showing at cost
                        </p>
                      ) : null}
                      {manualErrors[holding.companyId] ? (
                        <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                          {manualErrors[holding.companyId]}
                        </p>
                      ) : null}
                      {quoteErrorsByCompany[holding.companyId] ? (
                        <p className="mt-1 text-xs text-red-700 dark:text-red-400">
                          {quoteErrorsByCompany[holding.companyId]}
                        </p>
                      ) : null}
                    </td>
                    <td
                      className={`px-4 py-3 text-right ${
                        holding.dailyChangeAmountBase === null
                          ? "text-neutral-400 dark:text-neutral-600"
                          : gainLossClasses(holding.dailyChangeAmountBase)
                      }`}
                    >
                      {holding.dailyChangeAmountBase !== null ? (
                        <>
                          {formatSignedCurrency(holding.dailyChangeAmountBase, baseCurrency)}
                          <span className="block text-xs">
                            {formatSignedPercent(holding.dailyChangePercent ?? 0)}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-neutral-900 dark:text-neutral-100">
                      {formatCurrency(holding.marketValue, baseCurrency)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-medium ${gainLossClasses(holding.unrealisedGain)}`}
                    >
                      {formatSignedCurrency(holding.unrealisedGain, baseCurrency)}
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
