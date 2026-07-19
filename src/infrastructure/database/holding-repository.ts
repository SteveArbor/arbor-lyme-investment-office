import type { SupabaseClient } from "@supabase/supabase-js";

import type { Holding, HoldingPosition, HoldingRepository } from "@/domain/portfolio";
import type { Database } from "@/types/database";

type HoldingRow = Database["public"]["Tables"]["holdings"]["Row"];

function toDomain(row: HoldingRow): Holding {
  return {
    id: row.id,
    ownerId: row.owner_id,
    portfolioId: row.portfolio_id,
    companyId: row.company_id,
    quantity: Number(row.quantity),
    averageCost: Number(row.average_cost),
    targetAllocationPercent: Number(row.target_allocation_percent),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseHoldingRepository implements HoldingRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getByCompanyId(
    ownerId: string,
    portfolioId: string,
    companyId: string
  ): Promise<Holding | null> {
    const { data, error } = await this.client
      .from("holdings")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("portfolio_id", portfolioId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async listByPortfolioId(ownerId: string, portfolioId: string): Promise<Holding[]> {
    const { data, error } = await this.client
      .from("holdings")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("portfolio_id", portfolioId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async upsertPosition(
    ownerId: string,
    portfolioId: string,
    companyId: string,
    position: HoldingPosition
  ): Promise<Holding> {
    const { data, error } = await this.client
      .from("holdings")
      .upsert(
        {
          owner_id: ownerId,
          portfolio_id: portfolioId,
          company_id: companyId,
          quantity: position.quantity,
          average_cost: position.averageCost,
        },
        { onConflict: "portfolio_id,company_id" }
      )
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }

  async updateTargetAllocation(
    ownerId: string,
    holdingId: string,
    targetAllocationPercent: number
  ): Promise<Holding> {
    const { data, error } = await this.client
      .from("holdings")
      .update({ target_allocation_percent: targetAllocationPercent })
      .eq("owner_id", ownerId)
      .eq("id", holdingId)
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }

  async delete(ownerId: string, holdingId: string): Promise<void> {
    const { error } = await this.client
      .from("holdings")
      .delete()
      .eq("owner_id", ownerId)
      .eq("id", holdingId);

    if (error) throw error;
  }
}
