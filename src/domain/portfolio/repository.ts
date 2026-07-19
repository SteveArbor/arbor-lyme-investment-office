import type { Holding, HoldingPosition, Portfolio, PortfolioInput, PortfolioUpdate } from "./model";

/** Interface only — implemented in infrastructure/database. */
export interface PortfolioRepository {
  getById(ownerId: string, portfolioId: string): Promise<Portfolio | null>;
  list(ownerId: string): Promise<Portfolio[]>;
  create(ownerId: string, input: PortfolioInput): Promise<Portfolio>;
  update(ownerId: string, portfolioId: string, patch: PortfolioUpdate): Promise<Portfolio>;
}

/** Interface only — implemented in infrastructure/database. */
export interface HoldingRepository {
  getByCompanyId(ownerId: string, portfolioId: string, companyId: string): Promise<Holding | null>;
  listByPortfolioId(ownerId: string, portfolioId: string): Promise<Holding[]>;
  /**
   * Creates the holding if none exists for this portfolio/company pair,
   * otherwise replaces its quantity and average cost. The Trading domain
   * (docs/development-roadmap.md Phase 2, item 7) is the intended caller
   * on every transaction; Portfolio itself never invents a position.
   */
  upsertPosition(
    ownerId: string,
    portfolioId: string,
    companyId: string,
    position: HoldingPosition
  ): Promise<Holding>;
  updateTargetAllocation(
    ownerId: string,
    holdingId: string,
    targetAllocationPercent: number
  ): Promise<Holding>;
  delete(ownerId: string, holdingId: string): Promise<void>;
}
