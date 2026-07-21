/**
 * Portfolio Performance (Milestone 2.7, Part 1). Pure, framework-free
 * calculations only — no fetching, no Supabase, no Next.js. Every
 * function here takes plain data the caller has already assembled
 * (`application/services`, following the same composer pattern ADR 0024
 * established for `monitoring`, since performance genuinely spans two
 * domains: portfolio-owned holdings/cash and trading-owned transaction
 * history) and returns a plain result. Nothing here fetches a current
 * price — every market-value figure requires a caller-supplied
 * `currentPrice`, the same "no invented data" rule `calculateCurrentValue`
 * (model.ts) already follows.
 */

export interface HoldingPerformanceInput {
  companyId: string;
  quantity: number;
  /**
   * The portfolio's base currency (ADR 0026/0032: cost basis is recorded
   * in the ledger's own settlement currency at the historical FX rate
   * that applied on the trade date — HL's own contract notes state the
   * GBP execution price directly; this platform never re-derives or
   * re-converts a historical cost basis using today's rate). Never
   * multiplied by `fxRateToBase` — it is already in the base currency.
   */
  averageCost: number;
  /** Caller-supplied, in `currency` — this domain never invents, fetches, or caches a price. */
  currentPrice: number;
  /** ISO 4217 — the currency `currentPrice`/`previousClose` are quoted in (the security's own listing currency, e.g. USD for a NASDAQ line; GBP for a fund or a GBP-listed equity). */
  currency: string;
  /**
   * The already-resolved multiplier that converts an amount in `currency`
   * into the base currency (ADR 0032: `1` when `currency` already equals
   * the base currency — GBP→GBP identity — otherwise a real FX rate an
   * application-layer composer looked up). This domain function never
   * decides *which* rate applies or reads a currency's name to decide —
   * it only ever multiplies by whatever it's given, which is exactly what
   * keeps "never sum USD, EUR, and GBP directly" a property of the
   * caller's input construction, not a branch buried in this arithmetic.
   */
  fxRateToBase: number;
  /** Vendor-reported prior session close, in `currency` — absent for a manual mark or a provider that doesn't report it; never fabricated. */
  previousClose?: number;
  targetAllocationPercent: number;
}

export interface HoldingPerformance {
  companyId: string;
  quantity: number;
  averageCost: number;
  /** The original, unconverted price in `currency` — preserved for display so a holding's own trading-currency price is never hidden behind its base-currency equivalent. */
  currentPrice: number;
  currency: string;
  fxRateToBase: number;
  /** `currentPrice * fxRateToBase` — every money figure below this point is computed from this, never from `currentPrice` directly. */
  currentPriceBase: number;
  costBasis: number;
  marketValue: number;
  unrealisedGain: number;
  unrealisedGainPercent: number;
  allocationPercent: number;
  targetAllocationPercent: number;
  allocationDifferencePercent: number;
  /** `(currentPrice - previousClose) * quantity * fxRateToBase` — `null` when `previousClose` is absent, never a fabricated 0. */
  dailyChangeAmountBase: number | null;
  /** `(currentPrice - previousClose) / previousClose` — a currency-agnostic ratio, safe to compare across holdings priced in different currencies without conversion. */
  dailyChangePercent: number | null;
}

/**
 * Per-holding performance, given the portfolio's total value (holdings +
 * cash) for the allocation-percent calculation. `allocationDifferencePercent`
 * is signed: positive means overweight vs. target, negative means
 * underweight — the sign is deliberate so a caller can render "+3.2%" /
 * "−1.5%" without extra logic. All money figures (`marketValue`,
 * `unrealisedGain`, `dailyChangeAmountBase`) are in the base currency —
 * `currentPriceBase` is the one conversion point every other figure here
 * derives from (ADR 0032).
 */
export function calculateHoldingPerformance(
  holding: HoldingPerformanceInput,
  portfolioTotalValue: number
): HoldingPerformance {
  const currentPriceBase = holding.currentPrice * holding.fxRateToBase;
  const costBasis = holding.quantity * holding.averageCost;
  const marketValue = holding.quantity * currentPriceBase;
  const unrealisedGain = marketValue - costBasis;
  const unrealisedGainPercent = costBasis > 0 ? unrealisedGain / costBasis : 0;
  const allocationPercent = portfolioTotalValue > 0 ? marketValue / portfolioTotalValue : 0;

  const dailyChangeAmountBase =
    holding.previousClose !== undefined
      ? (holding.currentPrice - holding.previousClose) * holding.quantity * holding.fxRateToBase
      : null;
  const dailyChangePercent =
    holding.previousClose !== undefined && holding.previousClose !== 0
      ? (holding.currentPrice - holding.previousClose) / holding.previousClose
      : null;

  return {
    companyId: holding.companyId,
    quantity: holding.quantity,
    averageCost: holding.averageCost,
    currentPrice: holding.currentPrice,
    currency: holding.currency,
    fxRateToBase: holding.fxRateToBase,
    currentPriceBase,
    costBasis,
    marketValue,
    unrealisedGain,
    unrealisedGainPercent,
    allocationPercent,
    targetAllocationPercent: holding.targetAllocationPercent,
    allocationDifferencePercent: allocationPercent - holding.targetAllocationPercent,
    dailyChangeAmountBase,
    dailyChangePercent,
  };
}

export interface CashFlow {
  /** ISO date/datetime string. */
  date: string;
  /** Signed from the investor's perspective: negative = money contributed, positive = money withdrawn or the terminal value. */
  amount: number;
}

const DAYS_PER_YEAR = 365;

function daysBetween(from: string, to: string): number {
  return (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24);
}

function xnpv(rate: number, flows: CashFlow[]): number {
  const t0 = flows[0]!.date;
  return flows.reduce((sum, flow) => {
    const years = daysBetween(t0, flow.date) / DAYS_PER_YEAR;
    return sum + flow.amount / Math.pow(1 + rate, years);
  }, 0);
}

function xnpvDerivative(rate: number, flows: CashFlow[]): number {
  const t0 = flows[0]!.date;
  return flows.reduce((sum, flow) => {
    const years = daysBetween(t0, flow.date) / DAYS_PER_YEAR;
    if (years === 0) return sum;
    return sum - (years * flow.amount) / Math.pow(1 + rate, years + 1);
  }, 0);
}

/**
 * Money-weighted return (XIRR): the constant annualised rate that makes
 * the net present value of every external cash flow zero. See ADR 0027
 * for why Newton-Raphson-with-bisection-fallback was chosen over a
 * library dependency, the sign convention, and known limitations.
 * Returns `null` (never `NaN`/`Infinity`) when the input can't produce a
 * meaningful rate: fewer than two flows, all flows the same sign (no
 * money ever "returned"), or the search doesn't converge.
 */
export function calculateXirr(
  flows: CashFlow[],
  options: { guess?: number; maxIterations?: number; tolerance?: number } = {}
): number | null {
  if (flows.length < 2) return null;
  const hasPositive = flows.some((flow) => flow.amount > 0);
  const hasNegative = flows.some((flow) => flow.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const sorted = [...flows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const tolerance = options.tolerance ?? 1e-7;
  const maxIterations = options.maxIterations ?? 100;

  let rate = options.guess ?? 0.1;
  for (let i = 0; i < maxIterations; i++) {
    const value = xnpv(rate, sorted);
    if (Math.abs(value) < tolerance) return rate;
    const derivative = xnpvDerivative(rate, sorted);
    if (derivative === 0 || !Number.isFinite(derivative)) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -1) break;
    rate = next;
  }

  // Newton-Raphson can overshoot or fail to converge for pathological cash
  // flow patterns; bisection over a wide, financially-sane bracket is
  // slower but far more robust as a fallback, per ADR 0027.
  let low = -0.9999;
  let high = 10; // +1000% annualised — generous enough for any real portfolio
  let lowValue = xnpv(low, sorted);
  const highValue = xnpv(high, sorted);
  if (Math.sign(lowValue) === Math.sign(highValue)) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const midValue = xnpv(mid, sorted);
    if (Math.abs(midValue) < tolerance) return mid;
    if (Math.sign(midValue) === Math.sign(lowValue)) {
      low = mid;
      lowValue = midValue;
    } else {
      high = mid;
    }
  }
  return null;
}

export interface PortfolioPerformanceInput {
  cash: number;
  holdings: HoldingPerformanceInput[];
  /** Sum of every sell transaction's `realisedGain`. */
  realisedGainTotal: number;
  /** Sum of every dividend transaction's amount. */
  dividendsReceived: number;
  /** Sum of every fee transaction's amount, as a positive figure. */
  feesPaid: number;
  /** Sum of every tax transaction's amount, as a positive figure. */
  taxesPaid: number;
  /**
   * Net capital the investor has put in: sum of deposits minus sum of
   * withdrawals (cash_adjustment category deposit/withdrawal). The
   * denominator for totalReturnPercent — "how much did my money grow
   * relative to what I actually contributed," not relative to cost basis
   * (which excludes cash sitting uninvested) or market value (which is a
   * point-in-time snapshot, not a contribution figure).
   */
  netContributions: number;
  /**
   * Every deposit/withdrawal, chronological, for `calculateXirr` — the
   * caller appends the final "as if liquidated today" flow (current
   * totalValue, dated today) before calling this function, since only the
   * caller knows what "today" should mean for a given render.
   */
  cashFlows: CashFlow[];
}

export interface PortfolioPerformance {
  marketValue: number;
  costBasis: number;
  cash: number;
  totalValue: number;
  unrealisedGain: number;
  unrealisedGainPercent: number;
  realisedGain: number;
  dividendsReceived: number;
  feesPaid: number;
  taxesPaid: number;
  totalReturn: number;
  totalReturnPercent: number;
  moneyWeightedReturn: number | null;
  /** Average cost basis (£) per position — total cost basis ÷ number of holdings, not a per-share average across unlike companies. */
  averageHoldingCost: number;
  largestPosition: HoldingPerformance | null;
  largestGain: HoldingPerformance | null;
  largestLoss: HoldingPerformance | null;
  /**
   * Sum of every holding's `dailyChangeAmountBase` that has one — `null`
   * (never 0) when *no* holding in the portfolio has daily-change data at
   * all (e.g. every holding is manually priced), so a caller can tell
   * "flat today" apart from "unknown." Holdings without daily-change data
   * are simply excluded from the sum, not treated as zero change.
   */
  dailyGain: number | null;
  /** `dailyGain / (marketValue - dailyGain)` — relative to yesterday's implied market value, `null` under the same condition as `dailyGain`. */
  dailyGainPercent: number | null;
  largestDailyGainer: HoldingPerformance | null;
  largestDailyLoser: HoldingPerformance | null;
  holdings: HoldingPerformance[];
}

/**
 * The Portfolio Performance summary (Milestone 2.7). `totalReturn` is
 * unrealised + realised + dividends − fees − taxes: every way the
 * portfolio's value has changed relative to what was put into it,
 * combined into one figure. `totalReturnPercent` is relative to
 * `netContributions` — see that field's own doc comment for why.
 */
export function calculatePortfolioPerformance(
  input: PortfolioPerformanceInput
): PortfolioPerformance {
  const marketValue = input.holdings.reduce(
    (sum, h) => sum + h.quantity * h.currentPrice * h.fxRateToBase,
    0
  );
  const costBasis = input.holdings.reduce((sum, h) => sum + h.quantity * h.averageCost, 0);
  const totalValue = marketValue + input.cash;

  const dailyChangeAmounts = input.holdings
    .filter((h) => h.previousClose !== undefined)
    .map((h) => (h.currentPrice - h.previousClose!) * h.quantity * h.fxRateToBase);
  const dailyGain =
    dailyChangeAmounts.length > 0 ? dailyChangeAmounts.reduce((sum, v) => sum + v, 0) : null;
  const dailyGainPercent =
    dailyGain !== null && marketValue - dailyGain !== 0 ? dailyGain / (marketValue - dailyGain) : null;
  const unrealisedGain = marketValue - costBasis;
  const unrealisedGainPercent = costBasis > 0 ? unrealisedGain / costBasis : 0;

  const totalReturn =
    unrealisedGain +
    input.realisedGainTotal +
    input.dividendsReceived -
    input.feesPaid -
    input.taxesPaid;
  const totalReturnPercent =
    input.netContributions > 0 ? totalReturn / input.netContributions : 0;

  const holdingPerformances = input.holdings.map((h) =>
    calculateHoldingPerformance(h, totalValue)
  );

  const largestPosition = holdingPerformances.reduce<HoldingPerformance | null>(
    (largest, h) => (largest === null || h.marketValue > largest.marketValue ? h : largest),
    null
  );
  const largestGain = holdingPerformances.reduce<HoldingPerformance | null>(
    (largest, h) => (largest === null || h.unrealisedGain > largest.unrealisedGain ? h : largest),
    null
  );
  const largestLoss = holdingPerformances.reduce<HoldingPerformance | null>(
    (smallest, h) =>
      smallest === null || h.unrealisedGain < smallest.unrealisedGain ? h : smallest,
    null
  );
  const averageHoldingCost =
    holdingPerformances.length > 0 ? costBasis / holdingPerformances.length : 0;

  const holdingsWithDailyChange = holdingPerformances.filter(
    (h) => h.dailyChangeAmountBase !== null
  );
  const largestDailyGainer = holdingsWithDailyChange.reduce<HoldingPerformance | null>(
    (largest, h) =>
      largest === null || h.dailyChangeAmountBase! > largest.dailyChangeAmountBase! ? h : largest,
    null
  );
  const largestDailyLoser = holdingsWithDailyChange.reduce<HoldingPerformance | null>(
    (smallest, h) =>
      smallest === null || h.dailyChangeAmountBase! < smallest.dailyChangeAmountBase!
        ? h
        : smallest,
    null
  );

  return {
    marketValue,
    costBasis,
    cash: input.cash,
    totalValue,
    unrealisedGain,
    unrealisedGainPercent,
    realisedGain: input.realisedGainTotal,
    dividendsReceived: input.dividendsReceived,
    feesPaid: input.feesPaid,
    taxesPaid: input.taxesPaid,
    totalReturn,
    totalReturnPercent,
    moneyWeightedReturn: calculateXirr(input.cashFlows),
    averageHoldingCost,
    largestPosition,
    largestGain,
    largestLoss,
    dailyGain,
    dailyGainPercent,
    largestDailyGainer,
    largestDailyLoser,
    holdings: holdingPerformances,
  };
}
