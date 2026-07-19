import {
  createDomainEvent,
  type DomainEvent,
  NotFoundError,
  ValidationError,
} from "@/domain/shared";

import {
  type Holding,
  holdingPositionSchema,
  holdingTargetAllocationSchema,
  type Portfolio,
  portfolioSchema,
  portfolioUpdateSchema,
} from "./model";
import {
  calculatePortfolioAction,
  type PortfolioAction,
  portfolioActionInputsSchema,
} from "./portfolio-engine";
import type { HoldingRepository, PortfolioRepository } from "./repository";

export interface PortfolioCreatedPayload {
  portfolioId: string;
  name: string;
}

export interface PortfolioActionDeterminedPayload {
  companyId: string;
  portfolioId: string;
  action: PortfolioAction;
  investmentRating: string;
}

/**
 * Business logic for Portfolio and Holdings, plus the Portfolio Engine
 * entry point. Framework-independent (docs/domain-driven-design.md). This
 * service never fetches an InvestmentRating or a Valuation itself — those
 * come from their own bounded contexts and are assembled by the caller
 * (Application layer), keeping Portfolio decoupled from how Decision and
 * Valuation are implemented.
 */
export class PortfolioService {
  constructor(
    private readonly portfolios: PortfolioRepository,
    private readonly holdings: HoldingRepository
  ) {}

  async getPortfolio(ownerId: string, portfolioId: string): Promise<Portfolio> {
    const portfolio = await this.portfolios.getById(ownerId, portfolioId);
    if (!portfolio) {
      throw new NotFoundError("Portfolio", portfolioId);
    }
    return portfolio;
  }

  async listPortfolios(ownerId: string): Promise<Portfolio[]> {
    return this.portfolios.list(ownerId);
  }

  async createPortfolio(
    ownerId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ portfolio: Portfolio; event: DomainEvent<PortfolioCreatedPayload> }> {
    const parsed = portfolioSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid portfolio data",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const portfolio = await this.portfolios.create(ownerId, parsed.data);

    const event = createDomainEvent<PortfolioCreatedPayload>({
      type: "PortfolioCreated",
      actorId: ownerId,
      correlationId,
      payload: { portfolioId: portfolio.id, name: portfolio.name },
    });

    return { portfolio, event };
  }

  async updatePortfolio(ownerId: string, portfolioId: string, input: unknown): Promise<Portfolio> {
    const parsed = portfolioUpdateSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid portfolio update",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      throw new ValidationError("No fields provided to update", {});
    }

    await this.getPortfolio(ownerId, portfolioId);
    return this.portfolios.update(ownerId, portfolioId, parsed.data);
  }

  async listHoldings(ownerId: string, portfolioId: string): Promise<Holding[]> {
    return this.holdings.listByPortfolioId(ownerId, portfolioId);
  }

  async getHolding(
    ownerId: string,
    portfolioId: string,
    companyId: string
  ): Promise<Holding | null> {
    return this.holdings.getByCompanyId(ownerId, portfolioId, companyId);
  }

  /**
   * Records the resulting position after a transaction. Intended caller is
   * the Trading domain (docs/development-roadmap.md Phase 2, item 7),
   * which owns average-cost calculation from the transaction ledger —
   * Portfolio only stores the result.
   */
  async recordPosition(
    ownerId: string,
    portfolioId: string,
    companyId: string,
    input: unknown
  ): Promise<Holding> {
    const parsed = holdingPositionSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid holding position",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    await this.getPortfolio(ownerId, portfolioId);
    return this.holdings.upsertPosition(ownerId, portfolioId, companyId, parsed.data);
  }

  async updateTargetAllocation(
    ownerId: string,
    holdingId: string,
    input: unknown
  ): Promise<Holding> {
    const parsed = holdingTargetAllocationSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid target allocation",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    return this.holdings.updateTargetAllocation(
      ownerId,
      holdingId,
      parsed.data.targetAllocationPercent
    );
  }

  /**
   * The Portfolio Engine: determines the PortfolioAction for a company
   * from its InvestmentRating plus current portfolio state. Pure
   * calculation over caller-supplied inputs — see calculatePortfolioAction.
   */
  determineAction(
    ownerId: string,
    portfolioId: string,
    companyId: string,
    input: unknown,
    correlationId: string
  ): { action: PortfolioAction; event: DomainEvent<PortfolioActionDeterminedPayload> } {
    const parsed = portfolioActionInputsSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid portfolio action inputs",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }

    const action = calculatePortfolioAction(parsed.data);

    const event = createDomainEvent<PortfolioActionDeterminedPayload>({
      type: "PortfolioActionDetermined",
      actorId: ownerId,
      correlationId,
      payload: {
        companyId,
        portfolioId,
        action,
        investmentRating: parsed.data.investmentRating,
      },
    });

    return { action, event };
  }
}
