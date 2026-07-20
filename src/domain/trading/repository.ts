import type { CashAdjustmentCategory, Transaction } from "./model";

export interface RecordBuyData {
  portfolioId: string;
  companyId: string;
  quantity: number;
  pricePerUnit: number;
  occurredAt: string;
  notes: string | null;
  /**
   * Optional replay-safety key. The database, not this interface, is what
   * makes a repeated call with the same key a no-op after the first —
   * see supabase/migrations/20260719000015_transaction_integrity_hardening.sql.
   */
  idempotencyKey?: string;
}

/**
 * Identical shape to a buy today — kept as a distinct alias (not a
 * structural merge) because buy and sell are different domain operations
 * that happen to share an input shape, not the same operation.
 */
export type RecordSellData = RecordBuyData;

export interface RecordDividendData {
  portfolioId: string;
  companyId: string;
  amount: number;
  occurredAt: string;
  notes: string | null;
  reference?: string | null;
  idempotencyKey?: string;
}

export interface RecordFeeData {
  portfolioId: string;
  companyId?: string | null;
  amount: number;
  occurredAt: string;
  notes: string | null;
  reference?: string | null;
  idempotencyKey?: string;
}

export interface RecordInterestData {
  portfolioId: string;
  amount: number;
  occurredAt: string;
  notes: string | null;
  reference?: string | null;
  idempotencyKey?: string;
}

export interface RecordTaxData {
  portfolioId: string;
  companyId?: string | null;
  amount: number;
  occurredAt: string;
  notes: string | null;
  reference?: string | null;
  idempotencyKey?: string;
}

export interface RecordCashAdjustmentData {
  portfolioId: string;
  category: CashAdjustmentCategory;
  amount: number;
  occurredAt: string;
  notes: string | null;
  reference?: string | null;
  idempotencyKey?: string;
}

export interface TransactionListFilter {
  type?: Transaction["type"];
  companyId?: string;
  /** Inclusive lower bound on `occurredAt`, ISO date/datetime string. */
  from?: string;
  /** Inclusive upper bound on `occurredAt`, ISO date/datetime string. */
  to?: string;
  /** Sort by occurredAt. Defaults to "desc" (newest first). */
  sortDirection?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface TransactionPage {
  transactions: Transaction[];
  totalCount: number;
}

/**
 * Interface only — implemented in infrastructure/database. Every record*
 * method performs its ledger insert, holding update (buy/sell only), and
 * portfolio cash update as a single atomic database operation (Phase 2
 * Architecture Review finding 4.1 — see the Postgres functions in
 * supabase/migrations/20260719000014_atomic_transaction_functions.sql,
 * hardened further in
 * supabase/migrations/20260719000015_transaction_integrity_hardening.sql,
 * and extended with fee/interest/tax/categorised cash adjustments in
 * supabase/migrations/20260720000001_cash_management_and_performance.sql)
 * — never as separate calls a caller could partially apply. The resulting
 * holding quantity/average cost and any realised gain are computed inside
 * that database call, from state it has just locked — never accepted as a
 * value from this layer (docs/implementation/staff-engineer-review.md
 * finding H1) — which is also what closes the lost-update race finding H2
 * described: the lock is held across the read the computation depends on.
 * Append-only for the ledger row: no update or delete.
 */
export interface TransactionRepository {
  recordBuy(ownerId: string, data: RecordBuyData): Promise<Transaction>;
  recordSell(ownerId: string, data: RecordSellData): Promise<Transaction>;
  recordDividend(ownerId: string, data: RecordDividendData): Promise<Transaction>;
  recordFee(ownerId: string, data: RecordFeeData): Promise<Transaction>;
  recordInterest(ownerId: string, data: RecordInterestData): Promise<Transaction>;
  recordTax(ownerId: string, data: RecordTaxData): Promise<Transaction>;
  recordCashAdjustment(ownerId: string, data: RecordCashAdjustmentData): Promise<Transaction>;
  listByPortfolioId(ownerId: string, portfolioId: string): Promise<Transaction[]>;
  listByCompanyId(ownerId: string, portfolioId: string, companyId: string): Promise<Transaction[]>;
  /** Filtered, sorted (newest first), paginated read for the transaction history UI. */
  listByPortfolioIdFiltered(
    ownerId: string,
    portfolioId: string,
    filter: TransactionListFilter
  ): Promise<TransactionPage>;
  getById(ownerId: string, transactionId: string): Promise<Transaction | null>;
}
