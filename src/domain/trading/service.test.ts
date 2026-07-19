import { describe, expect, it } from "vitest";

import type {
  Holding,
  HoldingPosition,
  HoldingRepository,
  Portfolio,
  PortfolioInput,
  PortfolioRepository,
  PortfolioUpdate,
} from "@/domain/portfolio";
import { NotFoundError, ValidationError } from "@/domain/shared";

import type { Transaction } from "./model";
import type { CreateTransactionData, TransactionRepository } from "./repository";
import { TradingService } from "./service";

let nextId = 1;
const OWNER = "user-1";
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

class FakePortfolioRepository implements PortfolioRepository {
  public readonly rows: Portfolio[] = [];

  seed(cash: number): Portfolio {
    const now = new Date().toISOString();
    const portfolio: Portfolio = {
      id: `portfolio-${nextId++}`,
      ownerId: OWNER,
      name: "Core",
      cash,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.push(portfolio);
    return portfolio;
  }

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
    const index = this.rows.findIndex((row) => row.ownerId === ownerId && row.id === portfolioId);
    if (index === -1) throw new NotFoundError("Portfolio", portfolioId);
    this.rows[index] = { ...this.rows[index], ...patch, updatedAt: new Date().toISOString() };
    return this.rows[index];
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
      this.rows[this.rows.findIndex((row) => row.id === existing.id)] = updated;
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
    this.rows[index] = { ...this.rows[index], targetAllocationPercent };
    return this.rows[index];
  }

  async delete(ownerId: string, holdingId: string): Promise<void> {
    const index = this.rows.findIndex((row) => row.ownerId === ownerId && row.id === holdingId);
    if (index !== -1) this.rows.splice(index, 1);
  }
}

class FakeTransactionRepository implements TransactionRepository {
  public readonly rows: Transaction[] = [];

  async create(ownerId: string, data: CreateTransactionData): Promise<Transaction> {
    const transaction: Transaction = {
      id: `txn-${nextId++}`,
      ownerId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(transaction);
    return transaction;
  }

  async listByPortfolioId(ownerId: string, portfolioId: string): Promise<Transaction[]> {
    return this.rows.filter((row) => row.ownerId === ownerId && row.portfolioId === portfolioId);
  }

  async listByCompanyId(
    ownerId: string,
    portfolioId: string,
    companyId: string
  ): Promise<Transaction[]> {
    return this.rows.filter(
      (row) =>
        row.ownerId === ownerId && row.portfolioId === portfolioId && row.companyId === companyId
    );
  }
}

function buildService(startingCash: number) {
  const portfolios = new FakePortfolioRepository();
  const holdings = new FakeHoldingRepository();
  const transactions = new FakeTransactionRepository();
  const portfolio = portfolios.seed(startingCash);
  const service = new TradingService(transactions, holdings, portfolios);
  return { service, portfolio, portfolios, holdings, transactions };
}

const occurredAt = new Date().toISOString();

describe("TradingService.recordBuy", () => {
  it("creates a holding and deducts cash on a first buy", async () => {
    const { service, portfolio, portfolios, holdings } = buildService(10_000);

    const result = await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 50, occurredAt },
      "corr-1"
    );

    expect(result.transaction.amount).toBe(-500);
    const holding = await holdings.getByCompanyId(OWNER, portfolio.id, COMPANY_ID);
    expect(holding?.quantity).toBe(10);
    expect(holding?.averageCost).toBe(50);
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(9_500);
  });

  it("blends average cost across successive buys", async () => {
    const { service, portfolio, holdings } = buildService(10_000);
    await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 20, occurredAt },
      "corr-1"
    );
    await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 30, occurredAt },
      "corr-2"
    );

    const holding = await holdings.getByCompanyId(OWNER, portfolio.id, COMPANY_ID);
    expect(holding?.quantity).toBe(20);
    expect(holding?.averageCost).toBeCloseTo(25, 5);
  });

  it("rejects a buy that exceeds available cash", async () => {
    const { service, portfolio } = buildService(100);
    await expect(
      service.recordBuy(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 50, occurredAt },
        "corr-1"
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("TradingService.recordSell", () => {
  it("realises a gain, reduces quantity, and adds proceeds to cash", async () => {
    const { service, portfolio, holdings, portfolios } = buildService(10_000);
    await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 20, occurredAt },
      "corr-1"
    );

    const result = await service.recordSell(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 4, pricePerUnit: 30, occurredAt },
      "corr-2"
    );

    expect(result.transaction.realisedGain).toBe(40); // 4 * (30 - 20)
    const holding = await holdings.getByCompanyId(OWNER, portfolio.id, COMPANY_ID);
    expect(holding?.quantity).toBe(6);
    expect(holding?.averageCost).toBe(20); // unchanged for remaining shares
    const updatedPortfolio = await portfolios.getById(OWNER, portfolio.id);
    expect(updatedPortfolio?.cash).toBe(10_000 - 200 + 120);
  });

  it("rejects selling more than the current holding", async () => {
    const { service, portfolio } = buildService(10_000);
    await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 5, pricePerUnit: 20, occurredAt },
      "corr-1"
    );

    await expect(
      service.recordSell(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 25, occurredAt },
        "corr-2"
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects selling a company never held", async () => {
    const { service, portfolio } = buildService(10_000);
    await expect(
      service.recordSell(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 1, pricePerUnit: 25, occurredAt },
        "corr-1"
      )
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("TradingService.recordDividend", () => {
  it("adds the dividend amount to cash without changing the holding", async () => {
    const { service, portfolio, holdings, portfolios } = buildService(1_000);
    await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 5, pricePerUnit: 20, occurredAt },
      "corr-1"
    );

    await service.recordDividend(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, amount: 25, occurredAt },
      "corr-2"
    );

    const holding = await holdings.getByCompanyId(OWNER, portfolio.id, COMPANY_ID);
    expect(holding?.quantity).toBe(5);
    const updatedPortfolio = await portfolios.getById(OWNER, portfolio.id);
    expect(updatedPortfolio?.cash).toBe(1_000 - 100 + 25);
  });
});

describe("TradingService.recordCashAdjustment", () => {
  it("increases cash on a positive adjustment", async () => {
    const { service, portfolio, portfolios } = buildService(1_000);
    await service.recordCashAdjustment(OWNER, portfolio.id, { amount: 500, occurredAt }, "corr-1");
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(1_500);
  });

  it("rejects a withdrawal that would make cash negative", async () => {
    const { service, portfolio } = buildService(100);
    await expect(
      service.recordCashAdjustment(OWNER, portfolio.id, { amount: -500, occurredAt }, "corr-1")
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a zero-amount adjustment", async () => {
    const { service, portfolio } = buildService(100);
    await expect(
      service.recordCashAdjustment(OWNER, portfolio.id, { amount: 0, occurredAt }, "corr-1")
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("TradingService history", () => {
  it("preserves every transaction rather than overwriting", async () => {
    const { service, portfolio } = buildService(10_000);
    await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 5, pricePerUnit: 20, occurredAt },
      "corr-1"
    );
    await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 5, pricePerUnit: 22, occurredAt },
      "corr-2"
    );

    const history = await service.listTransactionsForCompany(OWNER, portfolio.id, COMPANY_ID);
    expect(history).toHaveLength(2);
  });
});
