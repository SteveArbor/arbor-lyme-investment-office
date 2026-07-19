import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Portfolio,
  PortfolioInput,
  PortfolioRepository,
  PortfolioUpdate,
} from "@/domain/portfolio";
import type { Database } from "@/types/database";

type PortfolioRow = Database["public"]["Tables"]["portfolios"]["Row"];

function toDomain(row: PortfolioRow): Portfolio {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    cash: Number(row.cash),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabasePortfolioRepository implements PortfolioRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getById(ownerId: string, portfolioId: string): Promise<Portfolio | null> {
    const { data, error } = await this.client
      .from("portfolios")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("id", portfolioId)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async list(ownerId: string): Promise<Portfolio[]> {
    const { data, error } = await this.client
      .from("portfolios")
      .select("*")
      .eq("owner_id", ownerId)
      .order("name", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async create(ownerId: string, input: PortfolioInput): Promise<Portfolio> {
    const { data, error } = await this.client
      .from("portfolios")
      .insert({ owner_id: ownerId, name: input.name, cash: input.cash })
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }

  async update(ownerId: string, portfolioId: string, patch: PortfolioUpdate): Promise<Portfolio> {
    const { data, error } = await this.client
      .from("portfolios")
      .update(patch)
      .eq("owner_id", ownerId)
      .eq("id", portfolioId)
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }
}
