import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  JournalEntry,
  JournalEntryCloseInput,
  JournalEntryOpenInput,
  JournalEntryStatus,
  JournalRepository,
} from "@/domain/journal";
import type { Database } from "@/types/database";

type JournalRow = Database["public"]["Tables"]["journal_entries"]["Row"];

function toDomain(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    ownerId: row.owner_id,
    companyId: row.company_id,
    portfolioId: row.portfolio_id,
    status: row.status as JournalEntryStatus,
    purchaseDate: row.purchase_date,
    purchasePrice: Number(row.purchase_price),
    fairValueAtPurchase: Number(row.fair_value_at_purchase),
    expectedReturnAtPurchase: Number(row.expected_return_at_purchase),
    positionSize: Number(row.position_size),
    convictionAtPurchase: Number(row.conviction_at_purchase),
    thesisSummary: row.thesis_summary,
    risks: row.risks,
    invalidationConditions: row.invalidation_conditions,
    saleDate: row.sale_date,
    saleReason: row.sale_reason,
    lessonsLearned: row.lessons_learned,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseJournalRepository implements JournalRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getById(ownerId: string, entryId: string): Promise<JournalEntry | null> {
    const { data, error } = await this.client
      .from("journal_entries")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", entryId)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async listByCompanyId(ownerId: string, companyId: string): Promise<JournalEntry[]> {
    const { data, error } = await this.client
      .from("journal_entries")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("company_id", companyId)
      .order("purchase_date", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async listByPortfolioId(ownerId: string, portfolioId: string): Promise<JournalEntry[]> {
    const { data, error } = await this.client
      .from("journal_entries")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("portfolio_id", portfolioId)
      .order("purchase_date", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async create(ownerId: string, input: JournalEntryOpenInput): Promise<JournalEntry> {
    const { data, error } = await this.client
      .from("journal_entries")
      .insert({
        owner_id: ownerId,
        company_id: input.companyId,
        portfolio_id: input.portfolioId,
        purchase_date: input.purchaseDate,
        purchase_price: input.purchasePrice,
        fair_value_at_purchase: input.fairValueAtPurchase,
        expected_return_at_purchase: input.expectedReturnAtPurchase,
        position_size: input.positionSize,
        conviction_at_purchase: input.convictionAtPurchase,
        thesis_summary: input.thesisSummary,
        risks: input.risks,
        invalidation_conditions: input.invalidationConditions,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }

  async close(
    ownerId: string,
    entryId: string,
    input: JournalEntryCloseInput
  ): Promise<JournalEntry> {
    const { data, error } = await this.client
      .from("journal_entries")
      .update({
        status: "closed",
        sale_date: input.saleDate,
        sale_reason: input.saleReason,
        lessons_learned: input.lessonsLearned,
      })
      .eq("owner_id", ownerId)
      .eq("id", entryId)
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }
}
