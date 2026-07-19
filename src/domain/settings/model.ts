import { z } from "zod";

/**
 * Foundation-scope settings only. docs/settings-engine.md defines the full
 * future schema (household/system resolution levels, provider selection,
 * feature flags, notification preferences, etc.) — this is deliberately
 * just the subset the Foundation milestone actually uses
 * (docs/development-roadmap.md), extended in later phases rather than
 * built speculatively now.
 */

export const BASE_CURRENCY_OPTIONS = ["GBP", "USD", "EUR"] as const;
export const APPEARANCE_OPTIONS = ["light", "dark", "system"] as const;

export const settingsSchema = z.object({
  baseCurrency: z.enum(BASE_CURRENCY_OPTIONS),
  timeZone: z.string().min(1, "Time zone is required"),
  appearance: z.enum(APPEARANCE_OPTIONS),
  monthlyIncomeTarget: z.number().nonnegative("Must not be negative"),
  secondaryMonthlyIncomeTarget: z.number().nonnegative("Must not be negative"),
});

export type Settings = z.infer<typeof settingsSchema>;

export const settingsUpdateSchema = settingsSchema.partial();
export type SettingsUpdate = z.infer<typeof settingsUpdateSchema>;

/** Matches the column defaults in supabase/migrations/*_create_user_settings.sql. */
export const FOUNDATION_DEFAULT_SETTINGS: Settings = {
  baseCurrency: "GBP",
  timeZone: "Europe/London",
  appearance: "system",
  monthlyIncomeTarget: 4000,
  secondaryMonthlyIncomeTarget: 5000,
};
