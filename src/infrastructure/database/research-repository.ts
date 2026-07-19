import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ResearchInput,
  ResearchNote,
  ResearchRepository,
  ResearchUpdate,
} from "@/domain/research";
import type { Database } from "@/types/database";

type ResearchRow = Database["public"]["Tables"]["research_notes"]["Row"];
type ResearchUpdateRow = Database["public"]["Tables"]["research_notes"]["Update"];

function toDomain(row: ResearchRow): ResearchNote {
  return {
    id: row.id,
    ownerId: row.owner_id,
    companyId: row.company_id,
    businessOverview: row.business_overview,
    investmentThesis: row.investment_thesis,
    economicMoat: row.economic_moat,
    management: row.management,
    financialStrength: row.financial_strength,
    capitalAllocation: row.capital_allocation,
    growthDrivers: row.growth_drivers,
    risks: row.risks,
    monitoringMetrics: row.monitoring_metrics,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(patch: ResearchUpdate): ResearchUpdateRow {
  const row: ResearchUpdateRow = {};
  if (patch.businessOverview !== undefined) row.business_overview = patch.businessOverview;
  if (patch.investmentThesis !== undefined) row.investment_thesis = patch.investmentThesis;
  if (patch.economicMoat !== undefined) row.economic_moat = patch.economicMoat;
  if (patch.management !== undefined) row.management = patch.management;
  if (patch.financialStrength !== undefined) row.financial_strength = patch.financialStrength;
  if (patch.capitalAllocation !== undefined) row.capital_allocation = patch.capitalAllocation;
  if (patch.growthDrivers !== undefined) row.growth_drivers = patch.growthDrivers;
  if (patch.risks !== undefined) row.risks = patch.risks;
  if (patch.monitoringMetrics !== undefined) row.monitoring_metrics = patch.monitoringMetrics;
  if (patch.notes !== undefined) row.notes = patch.notes;
  return row;
}

export class SupabaseResearchRepository implements ResearchRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getByCompanyId(ownerId: string, companyId: string): Promise<ResearchNote | null> {
    const { data, error } = await this.client
      .from("research_notes")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async listByCompanyIds(ownerId: string, companyIds: string[]): Promise<ResearchNote[]> {
    if (companyIds.length === 0) return [];
    const { data, error } = await this.client
      .from("research_notes")
      .select("*")
      .eq("owner_id", ownerId)
      .in("company_id", companyIds);

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }

  async create(ownerId: string, input: ResearchInput): Promise<ResearchNote> {
    const { data, error } = await this.client
      .from("research_notes")
      .insert({
        owner_id: ownerId,
        company_id: input.companyId,
        business_overview: input.businessOverview,
        investment_thesis: input.investmentThesis,
        economic_moat: input.economicMoat,
        management: input.management,
        financial_strength: input.financialStrength,
        capital_allocation: input.capitalAllocation,
        growth_drivers: input.growthDrivers,
        risks: input.risks,
        monitoring_metrics: input.monitoringMetrics,
        notes: input.notes,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }

  async update(ownerId: string, researchId: string, patch: ResearchUpdate): Promise<ResearchNote> {
    const { data, error } = await this.client
      .from("research_notes")
      .update(toRow(patch))
      .eq("owner_id", ownerId)
      .eq("id", researchId)
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }
}
