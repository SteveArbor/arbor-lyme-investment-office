import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CreateTransactionData,
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

export class SupabaseTransactionRepository implements TransactionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async create(ownerId: string, data: CreateTransactionData): Promise<Transaction> {
    const { data: row, error } = await this.client
      .from("transactions")
      .insert({
        owner_id: ownerId,
        portfolio_id: data.portfolioId,
        company_id: data.companyId,
        type: data.type,
        quantity: data.quantity,
        price_per_unit: data.pricePerUnit,
        amount: data.amount,
        realised_gain: data.realisedGain,
        occurred_at: data.occurredAt,
        notes: data.notes,
      })
      .select("*")
      .single();

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
