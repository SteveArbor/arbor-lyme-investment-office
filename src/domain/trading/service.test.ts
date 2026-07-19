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
import type {
  RecordBuyData,
  RecordCashAdjustmentData,
  RecordDividendData,
  RecordSellData,
} from "./repository";
import { TradingService } from "./service";

let nextId = 1;
const OWNER = "user-1";
const COMPANY_ID = "11111111-1111-4111-8111-111111111111";

class FakePortfolioRepository implements PortfolioRepository {
  constructor(public readonly rows: Portfolio[] = []) {}

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
  constructor(public readonly rows: Holding[] = []) {}

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

/**
 * Models the same all-or-nothing contract as the real Postgres functions
 * (supabase/migrations/20260719000014_atomic_transaction_functions.sql):
 * every record* method mutates the shared portfolio/holding rows and
 * appends the ledger row together, or — when `failNextWrite` is armed —
 * throws before touching any of the three, proving TradingService itself
 * has no code path that could apply one write without the others (the
 * thing finding 4.1 was actually about: TradingService no longer performs
 * three separate repository calls at all).
 */
class FakeAtomicTransactionRepository {
  public readonly rows: Transaction[] = [];

  private failNextWrite: Error | null = null;

  constructor(
    private readonly portfolioRows: Portfolio[],
    private readonly holdingRows: Holding[]
  ) {}

  /** Arms the next record* call to fail before any mutation is applied — simulates a crash mid-operation. */
  simulateFailureOnNextWrite(error: Error): void {
    this.failNextWrite = error;
  }

  private maybeFail(): void {
    if (this.failNextWrite) {
      const error = this.failNextWrite;
      this.failNextWrite = null;
      throw error;
    }
  }

  private applyCashDelta(ownerId: string, portfolioId: string, delta: number): void {
    const index = this.portfolioRows.findIndex(
      (row) => row.ownerId === ownerId && row.id === portfolioId
    );
    this.portfolioRows[index] = {
      ...this.portfolioRows[index],
      cash: this.portfolioRows[index].cash + delta,
    };
  }

  private applyHolding(
    ownerId: string,
    portfolioId: string,
    companyId: string,
    quantity: number,
    averageCost: number
  ): void {
    const index = this.holdingRows.findIndex(
      (row) =>
        row.ownerId === ownerId && row.portfolioId === portfolioId && row.companyId === companyId
    );
    if (index === -1) {
      const now = new Date().toISOString();
      this.holdingRows.push({
        id: `holding-${nextId++}`,
        ownerId,
        portfolioId,
        companyId,
        quantity,
        averageCost,
        targetAllocationPercent: 0,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      this.holdingRows[index] = { ...this.holdingRows[index], quantity, averageCost };
    }
  }

  async recordBuy(ownerId: string, data: RecordBuyData) {
    this.maybeFail();
    this.applyCashDelta(ownerId, data.portfolioId, -(data.quantity * data.pricePerUnit));
    this.applyHolding(
      ownerId,
      data.portfolioId,
      data.companyId,
      data.newHoldingQuantity,
      data.newHoldingAverageCost
    );
    const transaction: Transaction = {
      id: `txn-${nextId++}`,
      ownerId,
      portfolioId: data.portfolioId,
      companyId: data.companyId,
      type: "buy",
      quantity: data.quantity,
      pricePerUnit: data.pricePerUnit,
      amount: -(data.quantity * data.pricePerUnit),
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(transaction);
    return transaction;
  }

  async recordSell(ownerId: string, data: RecordSellData) {
    this.maybeFail();
    const proceeds = data.quantity * data.pricePerUnit;
    this.applyCashDelta(ownerId, data.portfolioId, proceeds);
    this.applyHolding(
      ownerId,
      data.portfolioId,
      data.companyId,
      data.newHoldingQuantity,
      data.newHoldingAverageCost
    );
    const transaction: Transaction = {
      id: `txn-${nextId++}`,
      ownerId,
      portfolioId: data.portfolioId,
      companyId: data.companyId,
      type: "sell",
      quantity: data.quantity,
      pricePerUnit: data.pricePerUnit,
      amount: proceeds,
      realisedGain: data.realisedGain,
      occurredAt: data.occurredAt,
      notes: data.notes,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(transaction);
    return transaction;
  }

  async recordDividend(ownerId: string, data: RecordDividendData) {
    this.maybeFail();
    this.applyCashDelta(ownerId, data.portfolioId, data.amount);
    const transaction: Transaction = {
      id: `txn-${nextId++}`,
      ownerId,
      portfolioId: data.portfolioId,
      companyId: data.companyId,
      type: "dividend",
      quantity: null,
      pricePerUnit: null,
      amount: data.amount,
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(transaction);
    return transaction;
  }

  async recordCashAdjustment(ownerId: string, data: RecordCashAdjustmentData) {
    this.maybeFail();
    this.applyCashDelta(ownerId, data.portfolioId, data.amount);
    const transaction: Transaction = {
      id: `txn-${nextId++}`,
      ownerId,
      portfolioId: data.portfolioId,
      companyId: null,
      type: "cash_adjustment",
      quantity: null,
      pricePerUnit: null,
      amount: data.amount,
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      createdAt: new Date().toISOString(),
    };
    this.rows.push(transaction);
    return transaction;
  }

  async listByPortfolioId(ownerId: string, portfolioId: string) {
    return this.rows.filter((row) => row.ownerId === ownerId && row.portfolioId === portfolioId);
  }

  async listByCompanyId(ownerId: string, portfolioId: string, companyId: string) {
    return this.rows.filter(
      (row) =>
        row.ownerId === ownerId && row.portfolioId === portfolioId && row.companyId === companyId
    );
  }
}

function buildService(startingCash: number) {
  const portfolios = new FakePortfolioRepository();
  const holdings = new FakeHoldingRepository();
  const portfolio = portfolios.seed(startingCash);
  const transactions = new FakeAtomicTransactionRepository(portfolios.rows, holdings.rows);
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

/**
 * Phase 2 Architecture Review finding 4.1 — rollback/crash-scenario
 * coverage. TradingService's write path is now exactly one call to
 * TransactionRepository per operation (no separate holding/cash calls it
 * could apply out of order); these tests prove that when that single call
 * fails, none of the three effects (ledger row, holding, cash) are
 * observable — the same guarantee the real Postgres functions provide via
 * an implicit transaction (see
 * supabase/migrations/20260719000014_atomic_transaction_functions.sql and
 * that migration's live-database rollback evidence, recorded in
 * docs/implementation/phase-2-architecture-review.md section 4.1).
 */
describe("TradingService — atomicity under a mid-operation failure", () => {
  it("recordBuy: a failure before the write leaves cash, holding, and ledger untouched", async () => {
    const { service, portfolio, portfolios, holdings, transactions } = buildService(10_000);
    transactions.simulateFailureOnNextWrite(new Error("simulated crash: connection dropped"));

    await expect(
      service.recordBuy(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 50, occurredAt },
        "corr-1"
      )
    ).rejects.toThrow("simulated crash");

    const updatedPortfolio = await portfolios.getById(OWNER, portfolio.id);
    expect(updatedPortfolio?.cash).toBe(10_000); // unchanged, not partially debited
    const holding = await holdings.getByCompanyId(OWNER, portfolio.id, COMPANY_ID);
    expect(holding).toBeNull(); // never created
    const history = await service.listTransactionsForCompany(OWNER, portfolio.id, COMPANY_ID);
    expect(history).toHaveLength(0); // no orphaned ledger row
  });

  it("recordSell: a failure before the write leaves the pre-existing holding and cash untouched", async () => {
    const { service, portfolio, portfolios, holdings, transactions } = buildService(10_000);
    await service.recordBuy(
      OWNER,
      portfolio.id,
      { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 20, occurredAt },
      "corr-1"
    );
    const cashAfterBuy = (await portfolios.getById(OWNER, portfolio.id))!.cash;

    transactions.simulateFailureOnNextWrite(new Error("simulated crash: connection dropped"));

    await expect(
      service.recordSell(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 4, pricePerUnit: 30, occurredAt },
        "corr-2"
      )
    ).rejects.toThrow("simulated crash");

    const updatedPortfolio = await portfolios.getById(OWNER, portfolio.id);
    expect(updatedPortfolio?.cash).toBe(cashAfterBuy); // proceeds never credited
    const holding = await holdings.getByCompanyId(OWNER, portfolio.id, COMPANY_ID);
    expect(holding?.quantity).toBe(10); // still the pre-sell quantity, not partially reduced
    const history = await service.listTransactionsForCompany(OWNER, portfolio.id, COMPANY_ID);
    expect(history).toHaveLength(1); // only the original buy, no orphaned sell row
  });

  it("recordCashAdjustment: a failure before the write leaves cash and the ledger untouched", async () => {
    const { service, portfolio, portfolios, transactions } = buildService(1_000);
    transactions.simulateFailureOnNextWrite(new Error("simulated crash: connection dropped"));

    await expect(
      service.recordCashAdjustment(OWNER, portfolio.id, { amount: 500, occurredAt }, "corr-1")
    ).rejects.toThrow("simulated crash");

    const updatedPortfolio = await portfolios.getById(OWNER, portfolio.id);
    expect(updatedPortfolio?.cash).toBe(1_000);
    const history = await service.listTransactions(OWNER, portfolio.id);
    expect(history).toHaveLength(0);
  });

  it("a failed operation does not affect a subsequent successful one", async () => {
    const { service, portfolio, portfolios, transactions } = buildService(1_000);
    transactions.simulateFailureOnNextWrite(new Error("simulated crash"));
    await expect(
      service.recordCashAdjustment(OWNER, portfolio.id, { amount: 500, occurredAt }, "corr-1")
    ).rejects.toThrow();

    // The armed failure only fires once — the system recovers cleanly for the next call.
    await service.recordCashAdjustment(OWNER, portfolio.id, { amount: 500, occurredAt }, "corr-2");
    const updatedPortfolio = await portfolios.getById(OWNER, portfolio.id);
    expect(updatedPortfolio?.cash).toBe(1_500);
  });
});
