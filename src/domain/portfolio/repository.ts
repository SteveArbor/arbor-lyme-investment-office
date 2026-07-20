import type { Holding, Portfolio, PortfolioInput, PortfolioUpdate } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface PortfolioRepository {
  getById(ownerId: string, portfolioId: string): Promise<Portfolio | null>;
  list(ownerId: string): Promise<Portfolio[]>;
  create(ownerId: string, input: PortfolioInput): Promise<Portfolio>;
  update(ownerId: string, portfolioId: string, patch: PortfolioUpdate): Promise<Portfolio>;
}

/**
 * Interface only — implemented in infrastructure/database. Note what's
 * deliberately absent: no method here writes `quantity` or `average_cost`.
 * Those columns are owned entirely by the Trading domain's atomic RPCs
 * (supabase/migrations/20260719000015_transaction_integrity_hardening.sql)
 * — the database itself now enforces this (the `authenticated` role has no
 * table-level grant able to touch either column), so a method offering a
 * direct write here would be dead on arrival, not just unused. See
 * docs/implementation/staff-engineer-review.md finding C1.
 */
export interface HoldingRepository {
  getByCompanyId(ownerId: string, portfolioId: string, companyId: string): Promise<Holding | null>;
  listByPortfolioId(ownerId: string, portfolioId: string): Promise<Holding[]>;
  updateTargetAllocation(
    ownerId: string,
    holdingId: string,
    targetAllocationPercent: number
  ): Promise<Holding>;
}
