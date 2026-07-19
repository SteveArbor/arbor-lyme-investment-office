import { z } from "zod";

/**
 * The Decision Journal (docs/development-roadmap.md Phase 2, item 8):
 * captures the reasoning behind a position at the moment it is opened —
 * purchase price, fair value, expected return, position size, conviction,
 * thesis, risks, and invalidation conditions — as an immutable snapshot,
 * so a later review compares the actual outcome against what was actually
 * believed at the time, not a retroactively-rewritten version of it. Sale
 * date, reason, and lessons learned are the only fields ever added later.
 */

export const JOURNAL_ENTRY_STATUS_OPTIONS = ["open", "closed"] as const;

export type JournalEntryStatus = (typeof JOURNAL_ENTRY_STATUS_OPTIONS)[number];

export const journalEntryOpenSchema = z.object({
  companyId: z.string().uuid(),
  portfolioId: z.string().uuid(),
  purchaseDate: z.string().datetime(),
  purchasePrice: z.number().positive("Purchase price must be greater than zero"),
  fairValueAtPurchase: z.number().describe("Estimated fair value at the time of purchase"),
  expectedReturnAtPurchase: z.number().describe("Annualised expected return, e.g. 0.15 = 15%"),
  positionSize: z.number().positive("Position size must be greater than zero"),
  convictionAtPurchase: z.number().min(0).max(1),
  thesisSummary: z.string().min(1, "Thesis summary is required").max(5_000),
  risks: z.string().max(5_000),
  invalidationConditions: z
    .string()
    .max(5_000)
    .describe("Conditions that, if met, would invalidate the thesis"),
});

export type JournalEntryOpenInput = z.infer<typeof journalEntryOpenSchema>;

export const journalEntryCloseSchema = z.object({
  saleDate: z.string().datetime(),
  saleReason: z.string().min(1, "Sale reason is required").max(2_000),
  lessonsLearned: z.string().max(5_000),
});

export type JournalEntryCloseInput = z.infer<typeof journalEntryCloseSchema>;

export interface JournalEntry {
  id: string;
  ownerId: string;
  companyId: string;
  portfolioId: string;
  status: JournalEntryStatus;
  purchaseDate: string;
  purchasePrice: number;
  fairValueAtPurchase: number;
  expectedReturnAtPurchase: number;
  positionSize: number;
  convictionAtPurchase: number;
  thesisSummary: string;
  risks: string;
  invalidationConditions: string;
  saleDate: string | null;
  saleReason: string | null;
  lessonsLearned: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Whole-day holding period; null while the entry is still open. */
export function calculateHoldingPeriodDays(
  purchaseDate: string,
  saleDate: string | null
): number | null {
  if (!saleDate) return null;
  const millisPerDay = 1000 * 60 * 60 * 24;
  const days = (new Date(saleDate).getTime() - new Date(purchaseDate).getTime()) / millisPerDay;
  return Math.max(0, Math.round(days));
}
