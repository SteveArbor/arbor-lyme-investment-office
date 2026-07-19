import type { Settings, SettingsUpdate } from "./model";

/**
 * Interface only — implemented in infrastructure/database
 * (dependency inversion, docs/domain-driven-design.md). The domain layer
 * knows nothing about Supabase.
 */
export interface SettingsRepository {
  getByUserId(userId: string): Promise<Settings | null>;
  update(userId: string, patch: SettingsUpdate): Promise<Settings>;
}
