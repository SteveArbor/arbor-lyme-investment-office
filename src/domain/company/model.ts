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

/**
 * The same four-value vocabulary `domain/market`'s `SecurityType` uses
 * (ADR 0031) — defined again here, not imported, because `company` is the
 * anchor entity every other domain references (`docs/domain-driven-design.md`)
 * and must not gain a dependency on `market`, a newer, more peripheral
 * domain that itself needs `ticker`/`exchange`/`currency` FROM a company to
 * build a `SecurityIdentifier`. Keeping the values identical is a
 * documented convention, not a type-level guarantee — if the two ever
 * needed to diverge, that would itself be a sign this field belongs
 * somewhere else.
 */
export const SECURITY_TYPE_OPTIONS = ["equity", "etf", "investment_trust", "fund"] as const;
export type SecurityType = (typeof SECURITY_TYPE_OPTIONS)[number];

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
  // Defaults to "equity" (the FOUNDATION_COMPANY_DEFAULTS value below) since
  // that's what every company created before this field existed already is.
  securityType: z.enum(SECURITY_TYPE_OPTIONS),
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

export const FOUNDATION_COMPANY_DEFAULTS: Pick<
  CompanyInput,
  "status" | "watchlist" | "securityType"
> = {
  status: "researching",
  watchlist: false,
  securityType: "equity",
};

/**
 * Country exposure (Phase 4 Portfolio Health/Risk Overview) is derived
 * from `exchange` rather than stored as its own field — no new data entry
 * is required, and a listing's exchange already is an authoritative fact
 * about where a security trades. This is a deliberate heuristic, not a
 * claim about where a company is domiciled or headquartered (ASML trades
 * on Euronext Amsterdam but is a Dutch company either way; the two happen
 * to agree here, not always true in general — e.g. a UK-listed ADR of a
 * US company would map to "United Kingdom" by this function even though
 * the underlying business is American). Extend this map, don't invent a
 * guess, the first time a held company's exchange isn't listed here.
 */
const EXCHANGE_COUNTRY_MAP: Record<string, string> = {
  NASDAQ: "United States",
  NYSE: "United States",
  LSE: "United Kingdom",
  "Euronext Amsterdam": "Netherlands",
  "Hargreaves Lansdown Fund Platform": "United Kingdom",
};

export function deriveCountryFromExchange(exchange: string): string {
  return EXCHANGE_COUNTRY_MAP[exchange] ?? "Unknown";
}
