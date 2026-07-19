import { describe, expect, it } from "vitest";

import { NotFoundError, ValidationError } from "@/domain/shared";

import type { Holding, HoldingPosition, Portfolio, PortfolioInput, PortfolioUpdate } from "./model";
import type { HoldingRepository, PortfolioRepository } from "./repository";
import { PortfolioService } from "./service";

let nextId = 1;

class FakePortfolioRepository implements PortfolioRepository {
  public readonly rows: Portfolio[] = [];

  async getById(ownerId: string, portfolioId: string): Promise<Portfolio | null> {
    return this.rows.find((row) => row.ownerId === ownerId && row.id === portfolioId) ?? null;
  }

  async list(ownerId: string): Promise<Portfolio[]> {
    return this.rows.filter((row) => row.ownerId === ownerId);
  }

  async create(ownerId: string, input: PortfolioInput): Promise<Portfolio> {
    const now = new Date().toISOString();
    const portfolio: Portfolio = {
      id: `portfolio-${nextId++}`,
      ownerId,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(portfolio);
    return portfolio;
  }

  async update(ownerId: string, portfolioId: string, patch: PortfolioUpdate): Promise<Portfolio> {
    const existing = await this.getById(ownerId, portfolioId);
    if (!existing) throw new NotFoundError("Portfolio", portfolioId);
    const updated: Portfolio = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    const index = this.rows.findIndex((row) => row.id === portfolioId);
    this.rows[index] = updated;
    return updated;
  }
}

class FakeHoldingRepository implements HoldingRepository {
  public readonly rows: Holding[] = [];

  async getByCompanyId(
    ownerId: string,
    portfolioId: string,
    companyId: string
  ): Promise<Holding | null> {
    return (
      this.rows.find(
        (row) =>
          row.ownerId === ownerId && row.portfolioId === portfolioId && row.companyId === companyId
      ) ?? null
    );
  }

  async listByPortfolioId(ownerId: string, portfolioId: string): Promise<Holding[]> {
    return this.rows.filter((row) => row.ownerId === ownerId && row.portfolioId === portfolioId);
  }

  async upsertPosition(
    ownerId: string,
    portfolioId: string,
    companyId: string,
    position: HoldingPosition
  ): Promise<Holding> {
    const existing = await this.getByCompanyId(ownerId, portfolioId, companyId);
    if (existing) {
      const updated: Holding = { ...existing, ...position, updatedAt: new Date().toISOString() };
      const index = this.rows.findIndex((row) => row.id === existing.id);
      this.rows[index] = updated;
      return updated;
    }
    const now = new Date().toISOString();
    const holding: Holding = {
      id: `holding-${nextId++}`,
      ownerId,
      portfolioId,
      companyId,
      targetAllocationPercent: 0,
      ...position,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(holding);
    return holding;
  }

  async updateTargetAllocation(
    ownerId: string,
    holdingId: string,
    targetAllocationPercent: number
  ): Promise<Holding> {
    const index = this.rows.findIndex((row) => row.ownerId === ownerId && row.id === holdingId);
    if (index === -1) throw new NotFoundError("Holding", holdingId);
    this.rows[index] = {
      ...this.rows[index],
      targetAllocationPercent,
      updatedAt: new Date().toISOString(),
    };
    return this.rows[index];
  }

  async delete(ownerId: string, holdingId: string): Promise<void> {
    const index = this.rows.findIndex((row) => row.ownerId === ownerId && row.id === holdingId);
    if (index !== -1) this.rows.splice(index, 1);
  }
}

function buildService() {
  return new PortfolioService(new FakePortfolioRepository(), new FakeHoldingRepository());
}

describe("PortfolioService", () => {
  it("creates a portfolio with a starting cash balance", async () => {
    const service = buildService();
    const result = await service.createPortfolio("user-1", { name: "Core", cash: 5_000 }, "corr-1");

    expect(result.portfolio.name).toBe("Core");
    expect(result.portfolio.cash).toBe(5_000);
    expect(result.event.type).toBe("PortfolioCreated");
  });

  it("rejects negative cash", async () => {
    const service = buildService();
    await expect(
      service.createPortfolio("user-1", { name: "Core", cash: -1 }, "corr-1")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError for an unknown portfolio", async () => {
    const service = buildService();
    await expect(service.getPortfolio("user-1", "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("records a position and later reflects updated quantity/average cost on the same holding", async () => {
    const service = buildService();
    const { portfolio } = await service.createPortfolio(
      "user-1",
      { name: "Core", cash: 10_000 },
      "corr-1"
    );
    const companyId = "11111111-1111-4111-8111-111111111111";

    const first = await service.recordPosition("user-1", portfolio.id, companyId, {
      quantity: 10,
      averageCost: 20,
    });
    expect(first.quantity).toBe(10);

    const second = await service.recordPosition("user-1", portfolio.id, companyId, {
      quantity: 15,
      averageCost: 22,
    });
    expect(second.id).toBe(first.id);
    expect(second.quantity).toBe(15);
    expect(second.averageCost).toBe(22);

    const holdings = await service.listHoldings("user-1", portfolio.id);
    expect(holdings).toHaveLength(1);
  });

  it("determines a PortfolioAction without touching any other domain's data", async () => {
    const service = buildService();
    const { portfolio } = await service.createPortfolio(
      "user-1",
      { name: "Core", cash: 10_000 },
      "corr-1"
    );
    const companyId = "11111111-1111-4111-8111-111111111111";

    const result = service.determineAction(
      "user-1",
      portfolio.id,
      companyId,
      {
        investmentRating: "strong_buy",
        currentPositionValue: 0,
        portfolioTotalValue: 100_000,
        targetAllocationPercent: 0.1,
        marginOfSafety: 0.4,
        requiredMarginOfSafety: 0.3,
        cashAvailable: 10_000,
        maxPositionPercent: 0.15,
      },
      "corr-1"
    );

    expect(result.action).toBe("initiate_position");
    expect(result.event.type).toBe("PortfolioActionDetermined");
  });

  it("rejects invalid portfolio action inputs", async () => {
    const service = buildService();
    expect(() =>
      service.determineAction(
        "user-1",
        "portfolio-1",
        "company-1",
        { investmentRating: "not_a_rating" },
        "corr-1"
      )
    ).toThrow(ValidationError);
  });
});
