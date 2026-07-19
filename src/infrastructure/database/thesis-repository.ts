import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Thesis,
  ThesisRepository,
  ThesisStatement,
  ThesisStatementStatus,
} from "@/domain/thesis";
import type { Database } from "@/types/database";

type ThesisRow = Database["public"]["Tables"]["theses"]["Row"];

function toDomain(row: ThesisRow): Thesis {
  return {
    id: row.id,
    ownerId: row.owner_id,
    companyId: row.company_id,
    statements: row.statements as unknown as ThesisStatement[],
    overallStatus: row.overall_status as ThesisStatementStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseThesisRepository implements ThesisRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getByCompanyId(ownerId: string, companyId: string): Promise<Thesis | null> {
    const { data, error } = await this.client
      .from("theses")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (error) throw error;
    return data ? toDomain(data) : null;
  }

  async create(ownerId: string, companyId: string): Promise<Thesis> {
    const { data, error } = await this.client
      .from("theses")
      .insert({ owner_id: ownerId, company_id: companyId })
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }

  async setStatements(
    ownerId: string,
    thesisId: string,
    statements: ThesisStatement[],
    overallStatus: Thesis["overallStatus"]
  ): Promise<Thesis> {
    const { data, error } = await this.client
      .from("theses")
      .update({
        statements:
          statements as unknown as Database["public"]["Tables"]["theses"]["Update"]["statements"],
        overall_status: overallStatus,
      })
      .eq("owner_id", ownerId)
      .eq("id", thesisId)
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }
}
