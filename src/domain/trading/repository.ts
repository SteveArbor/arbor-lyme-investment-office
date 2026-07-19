import type { Transaction } from "./model";

export interface RecordBuyData {
  portfolioId: string;
  companyId: string;
  quantity: number;
  pricePerUnit: number;
  occurredAt: string;
  notes: string | null;
  /**
   * The holding's quantity/average cost as read before computing the new
   * values below — the write is rejected (ConcurrentModificationError) if
   * the row no longer matches this, closing the lost-update race ADR 0025
   * addresses. 0/0 for a company with no existing holding.
   */
  expectedHoldingQuantity: number;
  expectedHoldingAverageCost: number;
  newHoldingQuantity: number;
  newHoldingAverageCost: number;
}

export interface RecordSellData extends RecordBuyData {
  realisedGain: number;
}

export interface RecordDividendData {
  portfolioId: string;
  companyId: string;
  amount: number;
  occurredAt: string;
  notes: string | null;
}

export interface RecordCashAdjustmentData {
  portfolioId: string;
  amount: number;
  occurredAt: string;
  notes: string | null;
}

/**
 * Interface only — implemented in infrastructure/database. Every record*
 * method performs its ledger insert, holding update, and portfolio cash
 * update as a single atomic database operation (Phase 2 Architecture
 * Review finding 4.1 — see the Postgres functions in
 * supabase/migrations/20260719000014_atomic_transaction_functions.sql) —
 * never as separate calls a caller could partially apply. Append-only for
 * the ledger row: no update or delete. recordBuy/recordSell reject a write
 * whose expected holding state is stale by throwing
 * ConcurrentModificationError (ADR 0025) — callers are expected to re-read
 * and retry.
 */
export interface TransactionRepository {
  recordBuy(ownerId: string, data: RecordBuyData): Promise<Transaction>;
  recordSell(ownerId: string, data: RecordSellData): Promise<Transaction>;
  recordDividend(ownerId: string, data: RecordDividendData): Promise<Transaction>;
  recordCashAdjustment(ownerId: string, data: RecordCashAdjustmentData): Promise<Transaction>;
  listByPortfolioId(ownerId: string, portfolioId: string): Promise<Transaction[]>;
  listByCompanyId(ownerId: string, portfolioId: string, companyId: string): Promise<Transaction[]>;
}
