import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  RecordBuyData,
  RecordCashAdjustmentData,
  RecordDividendData,
  RecordSellData,
  Transaction,
  TransactionRepository,
  TransactionType,
} from "@/domain/trading";
import type { Database } from "@/types/database";

type TransactionRow = Database["public"]["Tables"]["transactions"]["Row"];

function toDomain(row: TransactionRow): Transaction {
  return {
    id: row.id,
    ownerId: row.owner_id,
    portfolioId: row.portfolio_id,
    companyId: row.company_id,
    type: row.type as TransactionType,
    quantity: row.quantity !== null ? Number(row.quantity) : null,
    pricePerUnit: row.price_per_unit !== null ? Number(row.price_per_unit) : null,
    amount: Number(row.amount),
    realisedGain: row.realised_gain !== null ? Number(row.realised_gain) : null,
    occurredAt: row.occurred_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/**
 * Every record* method calls a single Postgres function that performs the
 * ledger insert, holding update, and portfolio cash update atomically —
 * see supabase/migrations/20260719000014_atomic_transaction_functions.sql
 * and Phase 2 Architecture Review finding 4.1. There is no path here that
 * issues three separate writes.
 */
export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async recordBuy(ownerId: string, data: RecordBuyData): Promise<Transaction> {
    const { data: row, error } = await this.client.rpc("record_buy_transaction", {
      p_owner_id: ownerId,
      p_portfolio_id: data.portfolioId,
      p_company_id: data.companyId,
      p_quantity: data.quantity,
      p_price_per_unit: data.pricePerUnit,
      p_occurred_at: data.occurredAt,
      p_notes: data.notes,
      p_new_holding_quantity: data.newHoldingQuantity,
      p_new_holding_average_cost: data.newHoldingAverageCost,
    });

    if (error) throw error;
    return toDomain(row);
  }

  async recordSell(ownerId: string, data: RecordSellData): Promise<Transaction> {
    const { data: row, error } = await this.client.rpc("record_sell_transaction", {
      p_owner_id: ownerId,
      p_portfolio_id: data.portfolioId,
      p_company_id: data.companyId,
      p_quantity: data.quantity,
      p_price_per_unit: data.pricePerUnit,
      p_occurred_at: data.occurredAt,
      p_notes: data.notes,
      p_new_holding_quantity: data.newHoldingQuantity,
      p_new_holding_average_cost: data.newHoldingAverageCost,
      p_realised_gain: data.realisedGain,
    });

    if (error) throw error;
    return toDomain(row);
  }

  async recordDividend(ownerId: string, data: RecordDividendData): Promise<Transaction> {
    const { data: row, error } = await this.client.rpc("record_dividend_transaction", {
      p_owner_id: ownerId,
      p_portfolio_id: data.portfolioId,
      p_company_id: data.companyId,
      p_amount: data.amount,
      p_occurred_at: data.occurredAt,
      p_notes: data.notes,
    });

    if (error) throw error;
    return toDomain(row);
  }

  async recordCashAdjustment(
    ownerId: string,
    data: RecordCashAdjustmentData
  ): Promise<Transaction> {
    const { data: row, error } = await this.client.rpc("record_cash_adjustment_transaction", {
      p_owner_id: ownerId,
      p_portfolio_id: data.portfolioId,
      p_amount: data.amount,
      p_occurred_at: data.occurredAt,
      p_notes: data.notes,
    });

    if (error) throw error;
    return toDomain(row);
  }

  async listByPortfolioId(ownerId: string, portfolioId: string): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("portfolio_id", portfolioId)
      .order("occurred_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async listByCompanyId(
    ownerId: string,
    portfolioId: string,
    companyId: string
  ): Promise<Transaction[]> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("portfolio_id", portfolioId)
      .eq("company_id", companyId)
      .order("occurred_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }
}
