import type { SupabaseClient } from "@supabase/supabase-js";

import type { Settings, SettingsRepository, SettingsUpdate } from "@/domain/settings";
import type { Database } from "@/types/database";

type UserSettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];
type UserSettingsUpdateRow = Database["public"]["Tables"]["user_settings"]["Update"];

function toDomain(row: UserSettingsRow): Settings {
  return {
    baseCurrency: row.base_currency,
    timeZone: row.time_zone,
    appearance: row.appearance,
    // numeric columns come back as strings from Postgres to avoid float
    // precision loss in transit (docs/database-design.md) — converted to
    // number at this boundary, the one place the domain layer expects a
    // plain number for arithmetic/display.
    monthlyIncomeTarget: Number(row.monthly_income_target),
    secondaryMonthlyIncomeTarget: Number(row.secondary_monthly_income_target),
  };
}

function toRow(patch: SettingsUpdate): UserSettingsUpdateRow {
  const row: UserSettingsUpdateRow = {};
  if (patch.baseCurrency !== undefined) row.base_currency = patch.baseCurrency;
  if (patch.timeZone !== undefined) row.time_zone = patch.timeZone;
  if (patch.appearance !== undefined) row.appearance = patch.appearance;
  if (patch.monthlyIncomeTarget !== undefined) {
    row.monthly_income_target = String(patch.monthlyIncomeTarget);
  }
  if (patch.secondaryMonthlyIncomeTarget !== undefined) {
    row.secondary_monthly_income_target = String(patch.secondaryMonthlyIncomeTarget);
  }
  return row;
}

/**
 * Supabase implementation of domain/settings's SettingsRepository. Row
 * Level Security (see supabase/migrations) scopes every query to the
 * authenticated user regardless of what this class does — this repository
 * relies on that, it does not re-implement authorization itself
 * (docs/security-principles.md).
 */
export class SupabaseSettingsRepository implements SettingsRepository {
  constructor(private readonly client: SupabaseClient<Database>) {}

  async getByUserId(userId: string): Promise<Settings | null> {
    const { data, error } = await this.client
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    return toDomain(data);
  }

  async update(userId: string, patch: SettingsUpdate): Promise<Settings> {
    const { data, error } = await this.client
      .from("user_settings")
      .update(toRow(patch))
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) throw error;
    return toDomain(data);
  }
}
