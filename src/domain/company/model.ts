import { z } from "zod";

/**
 * The Company aggregate — the anchor entity Research, Valuation, Decision,
 * Portfolio, and Trading all reference by `companyId`
 * (docs/domain-driven-design.md's Phase 2 design note). Owns curated,
 * human-maintained metadata; price data is deliberately NOT here — that
 * stays in `domain/market`, keyed by `ticker` (see the same design note
 * for why the two are kept separate).
 */

export const COMPANY_STATUS_OPTIONS = [
  "researching", // actively being researched, no rating yet
  "monitoring", // researched, watching for an entry point
  "holding", // currently an open portfolio position
  "passed", // researched, deliberately not investing
  "archived", // no longer relevant
] as const;

export type CompanyStatus = (typeof COMPANY_STATUS_OPTIONS)[number];

// Free-text rather than a closed enum for sector/industry/exchange:
// GICS-style classifications run to hundreds of values and change over
// time; a closed enum here would need constant maintenance for no real
// benefit at this system's scale (YAGNI, docs/engineering-standards.md).
export const companySchema = z.object({
  name: z.string().min(1, "Company name is required").max(200),
  ticker: z
    .string()
    .min(1, "Ticker is required")
    .max(20)
    .transform((value) => value.toUpperCase()),
  exchange: z.string().min(1, "Exchange is required").max(100),
  sector: z.string().min(1, "Sector is required").max(100),
  industry: z.string().min(1, "Industry is required").max(100),
  currency: z
    .string()
    .length(3, "Currency must be a 3-letter ISO 4217 code")
    // Case-insensitive here deliberately: this regex validates the RAW
    // input, before .transform() below runs — a same-line `[A-Z]`-only
    // regex would reject valid lowercase input the transform exists to
    // normalize in the first place.
    .regex(/^[A-Za-z]{3}$/, "Currency must be 3 letters, e.g. USD")
    .transform((value) => value.toUpperCase()),
  status: z.enum(COMPANY_STATUS_OPTIONS),
  watchlist: z.boolean(),
  notes: z.string().max(10_000).nullable(),
  profile: z.string().max(5_000).nullable(), // free-text company profile/description
});

export type CompanyInput = z.infer<typeof companySchema>;

export interface Company extends CompanyInput {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export const companyUpdateSchema = companySchema.partial();
export type CompanyUpdate = z.infer<typeof companyUpdateSchema>;

export const FOUNDATION_COMPANY_DEFAULTS: Pick<CompanyInput, "status" | "watchlist"> = {
  status: "researching",
  watchlist: false,
};
