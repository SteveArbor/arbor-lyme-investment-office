import { z } from "zod";

import type { ThesisStatementStatus } from "@/domain/thesis";

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

/**
 * Journal completeness (Phase 4): every field an open `JournalEntry`
 * actually requires is created together — `thesisSummary`/`risks`/
 * `invalidationConditions`/`expectedReturnAtPurchase`/
 * `convictionAtPurchase` are all mandatory at open time (`journalEntryOpenSchema`
 * above), so there is no "partially filled in" entry today; the real
 * incompleteness signal is coarser — whether an entry exists for this
 * holding at all. `reviewDate` is listed because the brief names it as a
 * field every investment should support, but no such column exists yet
 * (`entry` is never assumed to carry one) — it is always reported absent,
 * an honest gap this checklist surfaces rather than invents a value for
 * (see ADR "Phase 4 — Investment Intelligence").
 */
export const JOURNAL_COMPLETENESS_FIELD_KEYS = [
  "thesis",
  "expectedOutcome",
  "risks",
  "confidence",
  "exitStrategy",
  "thesisStatus",
  "reviewDate",
] as const;
export type JournalCompletenessFieldKey = (typeof JOURNAL_COMPLETENESS_FIELD_KEYS)[number];

export interface JournalCompletenessField {
  key: JournalCompletenessFieldKey;
  label: string;
  present: boolean;
}

export interface JournalCompleteness {
  fields: JournalCompletenessField[];
  /** Fraction of fields present, 0–1. */
  completePercent: number;
}

export function calculateJournalCompleteness(
  entry: Pick<JournalEntry, "risks" | "invalidationConditions"> | null,
  thesisStatus: ThesisStatementStatus | null
): JournalCompleteness {
  const hasEntry = entry !== null;
  const fields: JournalCompletenessField[] = [
    { key: "thesis", label: "Investment thesis & reason for purchase", present: hasEntry },
    { key: "expectedOutcome", label: "Expected outcome", present: hasEntry },
    {
      key: "risks",
      label: "Risks",
      present: hasEntry && entry.risks.trim().length > 0,
    },
    { key: "confidence", label: "Confidence", present: hasEntry },
    {
      key: "exitStrategy",
      label: "Exit strategy",
      present: hasEntry && entry.invalidationConditions.trim().length > 0,
    },
    { key: "thesisStatus", label: "Current thesis status", present: thesisStatus !== null },
    { key: "reviewDate", label: "Review date", present: false },
  ];

  return {
    fields,
    completePercent: fields.filter((f) => f.present).length / fields.length,
  };
}
