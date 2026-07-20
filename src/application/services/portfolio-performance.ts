import type { InvestmentRating } from "@/domain/decision";
import type { DecisionService } from "@/domain/decision";
import type { CashFlow } from "@/domain/portfolio";
import type { PortfolioService } from "@/domain/portfolio";
import type { Transaction } from "@/domain/trading";
import type { TradingService } from "@/domain/trading";

export interface PortfolioHoldingData {
  companyId: string;
  quantity: number;
  averageCost: number;
  targetAllocationPercent: number;
  investmentRating: InvestmentRating | null;
  lastUpdated: string;
}

export interface PortfolioPerformanceData {
  portfolioId: string;
  cash: number;
  holdings: PortfolioHoldingData[];
  realisedGainTotal: number;
  dividendsReceived: number;
  feesPaid: number;
  taxesPaid: number;
  netContributions: number;
  /**
   * Every deposit/withdrawal, chronological — the UI appends the final
   * "as if liquidated today" flow itself, once the user has entered
   * current prices, since this composer has no price to compute that
   * terminal value with (no market-data provider — no invented data).
   */
  cashFlows: CashFlow[];
}

export interface PortfolioPerformanceDependencies {
  portfolioService: Pick<PortfolioService, "getPortfolio" | "listHoldings">;
  tradingService: Pick<TradingService, "listTransactions">;
  decisionService: Pick<DecisionService, "getLatestRatings">;
}

function sumByType(transactions: Transaction[], type: Transaction["type"]): number {
  return transactions
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
}

/**
 * Gathers everything the Portfolio Performance view needs from Portfolio,
 * Trading, and Decision — three domains a single view legitimately spans,
 * the same reason `monitoring.ts` (ADR 0024) is an application-layer
 * composer rather than living inside any one of them. Deliberately does
 * NOT compute performance itself — that's `calculatePortfolioPerformance`
 * (`domain/portfolio/performance.ts`), a pure function this data feeds
 * once the UI has collected current prices from the user.
 */
export async function buildPortfolioPerformanceData(
  deps: PortfolioPerformanceDependencies,
  ownerId: string,
  portfolioId: string
): Promise<PortfolioPerformanceData> {
  const [portfolio, holdings, transactions] = await Promise.all([
    deps.portfolioService.getPortfolio(ownerId, portfolioId),
    deps.portfolioService.listHoldings(ownerId, portfolioId),
    deps.tradingService.listTransactions(ownerId, portfolioId),
  ]);

  const companyIds = holdings.map((holding) => holding.companyId);
  const ratings = await deps.decisionService.getLatestRatings(ownerId, companyIds);
  const ratingByCompany = new Map(ratings.map((rating) => [rating.companyId, rating.rating]));

  const realisedGainTotal = transactions
    .filter((transaction) => transaction.type === "sell")
    .reduce((sum, transaction) => sum + (transaction.realisedGain ?? 0), 0);
  const dividendsReceived = sumByType(transactions, "dividend");
  const feesPaid = sumByType(transactions, "fee");
  const taxesPaid = sumByType(transactions, "tax");

  const deposits = transactions.filter(
    (transaction) => transaction.type === "cash_adjustment" && transaction.category === "deposit"
  );
  const withdrawals = transactions.filter(
    (transaction) =>
      transaction.type === "cash_adjustment" && transaction.category === "withdrawal"
  );
  const netContributions =
    deposits.reduce((sum, transaction) => sum + transaction.amount, 0) +
    withdrawals.reduce((sum, transaction) => sum + transaction.amount, 0); // withdrawal amounts are already negative

  const cashFlows: CashFlow[] = [...deposits, ...withdrawals].map((transaction) => ({
    date: transaction.occurredAt,
    amount: transaction.amount,
  }));

  return {
    portfolioId,
    cash: portfolio.cash,
    holdings: holdings.map((holding) => ({
      companyId: holding.companyId,
      quantity: holding.quantity,
      averageCost: holding.averageCost,
      targetAllocationPercent: holding.targetAllocationPercent,
      investmentRating: ratingByCompany.get(holding.companyId) ?? null,
      lastUpdated: holding.updatedAt,
    })),
    realisedGainTotal,
    dividendsReceived,
    feesPaid,
    taxesPaid,
    netContributions,
    cashFlows,
  };
}
