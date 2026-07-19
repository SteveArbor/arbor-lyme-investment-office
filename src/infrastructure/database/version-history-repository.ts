import type { SupabaseClient } from "@supabase/supabase-js";

import type { EntityVersion, RecordVersionInput, VersionHistoryRepository } from "@/domain/shared";
import type { Database } from "@/types/database";

type EntityVersionRow = Database["public"]["Tables"]["entity_versions"]["Row"];

function toDomain<TSnapshot>(row: EntityVersionRow): EntityVersion<TSnapshot> {
  return {
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    versionNumber: row.version_number,
    snapshot: row.snapshot as TSnapshot,
    changedBy: row.changed_by ?? "",
    changedAt: row.changed_at,
    changeNote: row.change_note,
  };
}

/**
 * Shared Supabase implementation of VersionHistoryRepository, used by
 * every versioned domain (Research, Valuation, Thesis, Assumptions).
 * version_number is assigned server-side by a trigger
 * (supabase/migrations/20260719000006_create_entity_versions.sql) — never
 * computed here.
 */
export class SupabaseVersionHistoryRepository implements VersionHistoryRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async recordVersion<TSnapshot>(
    input: RecordVersionInput<TSnapshot>
  ): Promise<EntityVersion<TSnapshot>> {
    const { data, error } = await this.client
      .from("entity_versions")
      .insert({
        owner_id: input.ownerId,
        entity_type: input.entityType,
        entity_id: input.entityId,
        snapshot: input.snapshot as Record<string, unknown>,
        changed_by: input.changedBy,
        change_note: input.changeNote ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return toDomain<TSnapshot>(data);
  }

  async listVersions<TSnapshot>(
    ownerId: string,
    entityType: string,
    entityId: string
  ): Promise<EntityVersion<TSnapshot>[]> {
    const { data, error } = await this.client
      .from("entity_versions")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("version_number", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((row) => toDomain<TSnapshot>(row));
  }
}
