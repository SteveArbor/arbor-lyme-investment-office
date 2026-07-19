import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ConclusionSource,
  CreateRecommendationData,
  DecisionRecommendation,
  DecisionRepository,
  InvestmentRating,
} from "@/domain/decision";
import type { Database } from "@/types/database";

type DecisionRow = Database["public"]["Tables"]["decision_recommendations"]["Row"];

function toDomain(row: DecisionRow): DecisionRecommendation {
  return {
    id: row.id,
    ownerId: row.owner_id,
    companyId: row.company_id,
    inputs: row.inputs as unknown as DecisionRecommendation["inputs"],
    qualityScore: Number(row.quality_score),
    valuationScore: Number(row.valuation_score),
    overallScore: Number(row.overall_score),
    conviction: Number(row.conviction),
    rating: row.rating as InvestmentRating,
    conclusionSource: row.conclusion_source as ConclusionSource,
    generatedAt: row.generated_at,
  };
}

export class SupabaseDecisionRepository implements DecisionRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async create(ownerId: string, data: CreateRecommendationData): Promise<DecisionRecommendation> {
    const { data: row, error } = await this.client
      .from("decision_recommendations")
      .insert({
        owner_id: ownerId,
        company_id: data.companyId,
        inputs:
          data.inputs as unknown as Database["public"]["Tables"]["decision_recommendations"]["Insert"]["inputs"],
        quality_score: data.qualityScore,
        valuation_score: data.valuationScore,
        overall_score: data.overallScore,
        conviction: data.conviction,
        rating: data.rating,
        conclusion_source: data.conclusionSource,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(row);
  }

  async getLatestByCompanyId(
    ownerId: string,
    companyId: string
  ): Promise<DecisionRecommendation | null> {
    const { data, error } = await this.client
      .from("decision_recommendations")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("company_id", companyId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async listByCompanyId(ownerId: string, companyId: string): Promise<DecisionRecommendation[]> {
    const { data, error } = await this.client
      .from("decision_recommendations")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("company_id", companyId)
      .order("generated_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map(toDomain);
  }
}
