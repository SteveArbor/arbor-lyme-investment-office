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

import { mapTransactionRpcError } from "./transaction-error-mapper";

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
 * Every record* method calls a single Postgres function that locks the
 * owning portfolio (and, for buy/sell, the holding), computes the
 * resulting holding/cash/realised-gain state from that locked read, and
 * performs the ledger insert, holding update, and portfolio cash update
 * atomically — see
 * supabase/migrations/20260719000015_transaction_integrity_hardening.sql
 * and docs/implementation/staff-engineer-review.md findings C1/H1/H2. The
 * owner is derived by the function itself from the session's `auth.uid()`,
 * not passed as a parameter — there is nothing in this repository's calls
 * a compromised client could substitute a different resulting quantity,
 * average cost, or realised gain into.
 */
export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async recordBuy(ownerId: string, data: RecordBuyData): Promise<Transaction> {
    const { data: row, error } = await this.client.rpc("record_buy_transaction", {
      p_portfolio_id: data.portfolioId,
      p_company_id: data.companyId,
      p_quantity: data.quantity,
      p_price_per_unit: data.pricePerUnit,
      p_occurred_at: data.occurredAt,
      p_notes: data.notes,
      p_idempotency_key: data.idempotencyKey ?? null,
    });

    if (error) {
      mapTransactionRpcError(error, {
        operation: "recordBuy",
        ownerId,
        portfolioId: data.portfolioId,
      });
    }
    return toDomain(row);
  }

  async recordSell(ownerId: string, data: RecordSellData): Promise<Transaction> {
    const { data: row, error } = await this.client.rpc("record_sell_transaction", {
      p_portfolio_id: data.portfolioId,
      p_company_id: data.companyId,
      p_quantity: data.quantity,
      p_price_per_unit: data.pricePerUnit,
      p_occurred_at: data.occurredAt,
      p_notes: data.notes,
      p_idempotency_key: data.idempotencyKey ?? null,
    });

    if (error) {
      mapTransactionRpcError(error, {
        operation: "recordSell",
        ownerId,
        portfolioId: data.portfolioId,
      });
    }
    return toDomain(row);
  }

  async recordDividend(ownerId: string, data: RecordDividendData): Promise<Transaction> {
    const { data: row, error } = await this.client.rpc("record_dividend_transaction", {
      p_portfolio_id: data.portfolioId,
      p_company_id: data.companyId,
      p_amount: data.amount,
      p_occurred_at: data.occurredAt,
      p_notes: data.notes,
      p_idempotency_key: data.idempotencyKey ?? null,
    });

    if (error) {
      mapTransactionRpcError(error, {
        operation: "recordDividend",
        ownerId,
        portfolioId: data.portfolioId,
      });
    }
    return toDomain(row);
  }

  async recordCashAdjustment(
    ownerId: string,
    data: RecordCashAdjustmentData
  ): Promise<Transaction> {
    const { data: row, error } = await this.client.rpc("record_cash_adjustment_transaction", {
      p_portfolio_id: data.portfolioId,
      p_amount: data.amount,
      p_occurred_at: data.occurredAt,
      p_notes: data.notes,
      p_idempotency_key: data.idempotencyKey ?? null,
    });

    if (error) {
      mapTransactionRpcError(error, {
        operation: "recordCashAdjustment",
        ownerId,
        portfolioId: data.portfolioId,
      });
    }
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
