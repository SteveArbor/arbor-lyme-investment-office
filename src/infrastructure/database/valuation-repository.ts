import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Valuation,
  ValuationRepository,
  ValuationScenario,
  ValuationWriteData,
} from "@/domain/valuation";
import type { Database } from "@/types/database";

type ValuationRow = Database["public"]["Tables"]["valuations"]["Row"];

function toDomain(row: ValuationRow): Valuation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    companyId: row.company_id,
    projectionYears: row.projection_years,
    requiredReturn: Number(row.required_return),
    marginOfSafety: Number(row.margin_of_safety),
    bear: row.bear as unknown as ValuationScenario,
    base: row.base as unknown as ValuationScenario,
    bull: row.bull as unknown as ValuationScenario,
    blendedFairValue: Number(row.blended_fair_value),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(data: ValuationWriteData) {
  return {
    projection_years: data.projectionYears,
    required_return: data.requiredReturn,
    margin_of_safety: data.marginOfSafety,
    bear: data.bear as unknown as Database["public"]["Tables"]["valuations"]["Insert"]["bear"],
    base: data.base as unknown as Database["public"]["Tables"]["valuations"]["Insert"]["base"],
    bull: data.bull as unknown as Database["public"]["Tables"]["valuations"]["Insert"]["bull"],
    blended_fair_value: data.blendedFairValue,
  };
}

export class SupabaseValuationRepository implements ValuationRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getByCompanyId(ownerId: string, companyId: string): Promise<Valuation | null> {
    const { data, error } = await this.client
      .from("valuations")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async listByCompanyIds(ownerId: string, companyIds: string[]): Promise<Valuation[]> {
    if (companyIds.length === 0) return [];
    const { data, error } = await this.client
      .from("valuations")
      .select("*")
      .eq("owner_id", ownerId)
      .in("company_id", companyIds);

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async create(ownerId: string, companyId: string, data: ValuationWriteData): Promise<Valuation> {
    const { data: row, error } = await this.client
      .from("valuations")
      .insert({ owner_id: ownerId, company_id: companyId, ...toRow(data) })
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(row);
  }

  async update(ownerId: string, valuationId: string, data: ValuationWriteData): Promise<Valuation> {
    const { data: row, error } = await this.client
      .from("valuations")
      .update(toRow(data))
      .eq("owner_id", ownerId)
      .eq("id", valuationId)
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(row);
  }
}
