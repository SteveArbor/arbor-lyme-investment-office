import { describe, expect, it } from "vitest";

import type {
  Holding,
  Portfolio,
  PortfolioInput,
  PortfolioRepository,
  PortfolioUpdate,
} from "@/domain/portfolio";
import { ConflictError, NotFoundError } from "@/domain/shared";

import { calculateRealisedGain, calculateWeightedAverageCost, type Transaction } from "./model";
import type {
  RecordBuyData,
  RecordCashAdjustmentData,
  RecordDividendData,
  RecordFeeData,
  RecordInterestData,
  RecordSellData,
  RecordTaxData,
  TransactionListFilter,
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

class FakeHoldingRepository {
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
}

/**
 * Models the real Postgres functions
 * (supabase/migrations/20260719000015_transaction_integrity_hardening.sql,
 * extended in
 * supabase/migrations/20260720000001_cash_management_and_performance.sql),
 * not just their all-or-nothing write contract: the resulting
 * quantity/average cost/realised gain are computed *here*, from the
 * fake's own current state, exactly like the SQL function computes them
 * from a row it has just locked — the `RecordBuyData`/`RecordSellData`
 * inputs never carry those fields at all (docs/implementation/
 * staff-engineer-review.md finding H1), so there is no way for a test (or
 * TradingService) to hand this fake a value to blindly persist. Reuses
 * domain/trading/model.ts's calculateWeightedAverageCost/
 * calculateRealisedGain — the same functions the SQL formula mirrors —
 * so this fake and the real database compute the same thing from the same
 * inputs; the live validation script cross-checks that this parity holds
 * against a real Postgres instance, not just against itself.
 */
type FakeTransactionRow = Transaction & { idempotencyKeyForTest?: string };

class FakeAtomicTransactionRepository {
  public readonly rows: FakeTransactionRow[] = [];

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

  private findExistingByKey(
    ownerId: string,
    idempotencyKey: string | undefined
  ): FakeTransactionRow | null {
    if (!idempotencyKey) return null;
    return (
      this.rows.find(
        (row) => row.ownerId === ownerId && row.idempotencyKeyForTest === idempotencyKey
      ) ?? null
    );
  }

  private portfolio(ownerId: string, portfolioId: string): Portfolio {
    const portfolio = this.portfolioRows.find(
      (row) => row.ownerId === ownerId && row.id === portfolioId
    );
    if (!portfolio) throw new NotFoundError("Portfolio", portfolioId);
    return portfolio;
  }

  private holding(ownerId: string, portfolioId: string, companyId: string): Holding | undefined {
    return this.holdingRows.find(
      (row) =>
        row.ownerId === ownerId && row.portfolioId === portfolioId && row.companyId === companyId
    );
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

  private record(row: Omit<FakeTransactionRow, "id" | "createdAt">): FakeTransactionRow {
    const transaction: FakeTransactionRow = {
      id: `txn-${nextId++}`,
      createdAt: new Date().toISOString(),
      ...row,
    };
    this.rows.push(transaction);
    return transaction;
  }

  async recordBuy(ownerId: string, data: RecordBuyData) {
    const existing = this.findExistingByKey(ownerId, data.idempotencyKey);
    if (existing) return existing;
    this.maybeFail();

    const portfolio = this.portfolio(ownerId, data.portfolioId);
    const cost = data.quantity * data.pricePerUnit;
    if (cost > portfolio.cash) {
      throw new ConflictError("Insufficient cash for this purchase");
    }
    const existingHolding = this.holding(ownerId, data.portfolioId, data.companyId);
    const newQuantity = (existingHolding?.quantity ?? 0) + data.quantity;
    const newAverageCost = calculateWeightedAverageCost(
      existingHolding?.quantity ?? 0,
      existingHolding?.averageCost ?? 0,
      data.quantity,
      data.pricePerUnit
    );

    this.applyCashDelta(ownerId, data.portfolioId, -cost);
    this.applyHolding(ownerId, data.portfolioId, data.companyId, newQuantity, newAverageCost);

    return this.record({
      ownerId,
      portfolioId: data.portfolioId,
      companyId: data.companyId,
      type: "buy",
      category: null,
      quantity: data.quantity,
      pricePerUnit: data.pricePerUnit,
      amount: -cost,
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      reference: null,
      idempotencyKeyForTest: data.idempotencyKey,
    });
  }

  async recordSell(ownerId: string, data: RecordSellData) {
    const existing = this.findExistingByKey(ownerId, data.idempotencyKey);
    if (existing) return existing;
    this.maybeFail();

    this.portfolio(ownerId, data.portfolioId);
    const existingHolding = this.holding(ownerId, data.portfolioId, data.companyId);
    if (!existingHolding || existingHolding.quantity < data.quantity) {
      throw new ConflictError("Insufficient holding to sell");
    }

    const proceeds = data.quantity * data.pricePerUnit;
    const realisedGain = calculateRealisedGain(
      data.quantity,
      data.pricePerUnit,
      existingHolding.averageCost
    );
    const newQuantity = existingHolding.quantity - data.quantity;
    const newAverageCost = newQuantity > 0 ? existingHolding.averageCost : 0;

    this.applyCashDelta(ownerId, data.portfolioId, proceeds);
    this.applyHolding(ownerId, data.portfolioId, data.companyId, newQuantity, newAverageCost);

    return this.record({
      ownerId,
      portfolioId: data.portfolioId,
      companyId: data.companyId,
      type: "sell",
      category: null,
      quantity: data.quantity,
      pricePerUnit: data.pricePerUnit,
      amount: proceeds,
      realisedGain,
      occurredAt: data.occurredAt,
      notes: data.notes,
      reference: null,
      idempotencyKeyForTest: data.idempotencyKey,
    });
  }

  async recordDividend(ownerId: string, data: RecordDividendData) {
    const existing = this.findExistingByKey(ownerId, data.idempotencyKey);
    if (existing) return existing;
    this.maybeFail();

    this.portfolio(ownerId, data.portfolioId);
    this.applyCashDelta(ownerId, data.portfolioId, data.amount);
    return this.record({
      ownerId,
      portfolioId: data.portfolioId,
      companyId: data.companyId,
      type: "dividend",
      category: null,
      quantity: null,
      pricePerUnit: null,
      amount: data.amount,
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      reference: data.reference ?? null,
      idempotencyKeyForTest: data.idempotencyKey,
    });
  }

  async recordFee(ownerId: string, data: RecordFeeData) {
    const existing = this.findExistingByKey(ownerId, data.idempotencyKey);
    if (existing) return existing;
    this.maybeFail();

    const portfolio = this.portfolio(ownerId, data.portfolioId);
    if (data.amount > portfolio.cash) {
      throw new ConflictError("Insufficient cash to record this fee");
    }
    this.applyCashDelta(ownerId, data.portfolioId, -data.amount);
    return this.record({
      ownerId,
      portfolioId: data.portfolioId,
      companyId: data.companyId ?? null,
      type: "fee",
      category: null,
      quantity: null,
      pricePerUnit: null,
      amount: -data.amount,
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      reference: data.reference ?? null,
      idempotencyKeyForTest: data.idempotencyKey,
    });
  }

  async recordInterest(ownerId: string, data: RecordInterestData) {
    const existing = this.findExistingByKey(ownerId, data.idempotencyKey);
    if (existing) return existing;
    this.maybeFail();

    this.portfolio(ownerId, data.portfolioId);
    this.applyCashDelta(ownerId, data.portfolioId, data.amount);
    return this.record({
      ownerId,
      portfolioId: data.portfolioId,
      companyId: null,
      type: "interest",
      category: null,
      quantity: null,
      pricePerUnit: null,
      amount: data.amount,
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      reference: data.reference ?? null,
      idempotencyKeyForTest: data.idempotencyKey,
    });
  }

  async recordTax(ownerId: string, data: RecordTaxData) {
    const existing = this.findExistingByKey(ownerId, data.idempotencyKey);
    if (existing) return existing;
    this.maybeFail();

    const portfolio = this.portfolio(ownerId, data.portfolioId);
    if (data.amount > portfolio.cash) {
      throw new ConflictError("Insufficient cash to record this tax payment");
    }
    this.applyCashDelta(ownerId, data.portfolioId, -data.amount);
    return this.record({
      ownerId,
      portfolioId: data.portfolioId,
      companyId: data.companyId ?? null,
      type: "tax",
      category: null,
      quantity: null,
      pricePerUnit: null,
      amount: -data.amount,
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      reference: data.reference ?? null,
      idempotencyKeyForTest: data.idempotencyKey,
    });
  }

  async recordCashAdjustment(ownerId: string, data: RecordCashAdjustmentData) {
    const existing = this.findExistingByKey(ownerId, data.idempotencyKey);
    if (existing) return existing;
    this.maybeFail();

    this.portfolio(ownerId, data.portfolioId);
    const signedAmount =
      data.category === "deposit"
        ? data.amount
        : data.category === "withdrawal"
          ? -data.amount
          : data.amount;
    this.applyCashDelta(ownerId, data.portfolioId, signedAmount);
    return this.record({
      ownerId,
      portfolioId: data.portfolioId,
      companyId: null,
      type: "cash_adjustment",
      category: data.category,
      quantity: null,
      pricePerUnit: null,
      amount: signedAmount,
      realisedGain: null,
      occurredAt: data.occurredAt,
      notes: data.notes,
      reference: data.reference ?? null,
      idempotencyKeyForTest: data.idempotencyKey,
    });
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

  async listByPortfolioIdFiltered(
    ownerId: string,
    portfolioId: string,
    filter: TransactionListFilter
  ) {
    let matches = this.rows.filter(
      (row) => row.ownerId === ownerId && row.portfolioId === portfolioId
    );
    if (filter.type) matches = matches.filter((row) => row.type === filter.type);
    if (filter.companyId) matches = matches.filter((row) => row.companyId === filter.companyId);
    if (filter.from) matches = matches.filter((row) => row.occurredAt >= filter.from!);
    if (filter.to) matches = matches.filter((row) => row.occurredAt <= filter.to!);
    matches = [...matches].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

    const totalCount = matches.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 25;
    return { transactions: matches.slice(offset, offset + limit), totalCount };
  }

  async getById(ownerId: string, transactionId: string) {
    return this.rows.find((row) => row.ownerId === ownerId && row.id === transactionId) ?? null;
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

  it("rejects a buy that exceeds available cash with a ConflictError", async () => {
    const { service, portfolio } = buildService(100);
    await expect(
      service.recordBuy(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 50, occurredAt },
        "corr-1"
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("replays the same transaction instead of double-debiting cash when the idempotency key repeats", async () => {
    const { service, portfolio, portfolios } = buildService(10_000);
    const input = { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 50, occurredAt };

    const first = await service.recordBuy(OWNER, portfolio.id, input, "corr-retry-1");
    const second = await service.recordBuy(OWNER, portfolio.id, input, "corr-retry-1");

    expect(second.transaction.id).toBe(first.transaction.id);
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(9_500); // debited once, not twice
  });

  it("applies two calls with different idempotency keys as two independent buys", async () => {
    const { service, portfolio, portfolios } = buildService(10_000);
    const input = { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 50, occurredAt };

    await service.recordBuy(OWNER, portfolio.id, input, "corr-a");
    await service.recordBuy(OWNER, portfolio.id, input, "corr-b");

    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(9_000); // debited twice — these are genuinely different purchases
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

  it("rejects selling more than the current holding with a ConflictError", async () => {
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
    ).rejects.toBeInstanceOf(ConflictError);
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
    ).rejects.toBeInstanceOf(ConflictError);
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

describe("TradingService.recordFee", () => {
  it("debits cash for a fee", async () => {
    const { service, portfolio, portfolios } = buildService(1_000);
    const result = await service.recordFee(
      OWNER,
      portfolio.id,
      { amount: 15, occurredAt, notes: "Platform fee" },
      "corr-1"
    );
    expect(result.transaction.amount).toBe(-15);
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(985);
  });

  it("rejects a fee that exceeds available cash with a ConflictError", async () => {
    const { service, portfolio } = buildService(10);
    await expect(
      service.recordFee(OWNER, portfolio.id, { amount: 50, occurredAt, notes: null }, "corr-1")
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("TradingService.recordInterest", () => {
  it("credits cash for interest received", async () => {
    const { service, portfolio, portfolios } = buildService(1_000);
    const result = await service.recordInterest(
      OWNER,
      portfolio.id,
      { amount: 3.5, occurredAt, notes: null },
      "corr-1"
    );
    expect(result.transaction.amount).toBe(3.5);
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(1_003.5);
  });
});

describe("TradingService.recordTax", () => {
  it("debits cash for a tax payment", async () => {
    const { service, portfolio, portfolios } = buildService(1_000);
    await service.recordTax(
      OWNER,
      portfolio.id,
      { amount: 40, occurredAt, notes: "Withholding" },
      "corr-1"
    );
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(960);
  });

  it("rejects a tax payment that exceeds available cash with a ConflictError", async () => {
    const { service, portfolio } = buildService(10);
    await expect(
      service.recordTax(OWNER, portfolio.id, { amount: 50, occurredAt, notes: null }, "corr-1")
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("TradingService.recordCashAdjustment", () => {
  it("increases cash for a deposit", async () => {
    const { service, portfolio, portfolios } = buildService(1_000);
    const result = await service.recordCashAdjustment(
      OWNER,
      portfolio.id,
      { category: "deposit", amount: 500, occurredAt },
      "corr-1"
    );
    expect(result.transaction.amount).toBe(500);
    expect(result.transaction.category).toBe("deposit");
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(1_500);
  });

  it("decreases cash for a withdrawal, given a positive amount", async () => {
    const { service, portfolio, portfolios } = buildService(1_000);
    const result = await service.recordCashAdjustment(
      OWNER,
      portfolio.id,
      { category: "withdrawal", amount: 300, occurredAt },
      "corr-1"
    );
    expect(result.transaction.amount).toBe(-300);
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(700);
  });

  it("rejects a withdrawal that would make cash negative with a ConflictError", async () => {
    const { service, portfolio } = buildService(100);
    await expect(
      service.recordCashAdjustment(
        OWNER,
        portfolio.id,
        { category: "withdrawal", amount: 500, occurredAt },
        "corr-1"
      )
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("allows a signed amount for a correction, either direction", async () => {
    const { service, portfolio, portfolios } = buildService(1_000);
    await service.recordCashAdjustment(
      OWNER,
      portfolio.id,
      { category: "correction", amount: -50, occurredAt },
      "corr-1"
    );
    const updated = await portfolios.getById(OWNER, portfolio.id);
    expect(updated?.cash).toBe(950);
  });

  it("rejects a zero-amount adjustment", async () => {
    const { service, portfolio } = buildService(100);
    await expect(
      service.recordCashAdjustment(
        OWNER,
        portfolio.id,
        { category: "other", amount: 0, occurredAt },
        "corr-1"
      )
    ).rejects.toThrow(); // caught by zod (ValidationError), before any repository call
  });
});

describe("TradingService history and filtering", () => {
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

  it("filters by type and paginates", async () => {
    const { service, portfolio } = buildService(10_000);
    await service.recordFee(OWNER, portfolio.id, { amount: 1, occurredAt, notes: null }, "c1");
    await service.recordFee(OWNER, portfolio.id, { amount: 2, occurredAt, notes: null }, "c2");
    await service.recordInterest(
      OWNER,
      portfolio.id,
      { amount: 3, occurredAt, notes: null },
      "c3"
    );

    const feesOnly = await service.listTransactionsFiltered(OWNER, portfolio.id, {
      type: "fee",
    });
    expect(feesOnly.totalCount).toBe(2);
    expect(feesOnly.transactions).toHaveLength(2);

    const firstPage = await service.listTransactionsFiltered(OWNER, portfolio.id, { limit: 1 });
    expect(firstPage.totalCount).toBe(3);
    expect(firstPage.transactions).toHaveLength(1);
  });

  it("fetches a single transaction by id, or throws NotFoundError", async () => {
    const { service, portfolio } = buildService(10_000);
    const { transaction } = await service.recordInterest(
      OWNER,
      portfolio.id,
      { amount: 5, occurredAt, notes: null },
      "corr-1"
    );

    const fetched = await service.getTransaction(OWNER, transaction.id);
    expect(fetched.id).toBe(transaction.id);

    await expect(service.getTransaction(OWNER, "missing")).rejects.toBeInstanceOf(NotFoundError);
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
      service.recordCashAdjustment(
        OWNER,
        portfolio.id,
        { category: "deposit", amount: 500, occurredAt },
        "corr-1"
      )
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
      service.recordCashAdjustment(
        OWNER,
        portfolio.id,
        { category: "deposit", amount: 500, occurredAt },
        "corr-1"
      )
    ).rejects.toThrow();

    // The armed failure only fires once — the system recovers cleanly for the next call.
    await service.recordCashAdjustment(
      OWNER,
      portfolio.id,
      { category: "deposit", amount: 500, occurredAt },
      "corr-2"
    );
    const updatedPortfolio = await portfolios.getById(OWNER, portfolio.id);
    expect(updatedPortfolio?.cash).toBe(1_500);
  });
});

/**
 * Zod rejects malformed input before any repository call — these tests
 * confirm that boundary, not that a particular error message appears
 * (docs/development-roadmap.md "Validation": negative holdings/cash,
 * invalid prices, quantities, and dates must never reach the database).
 * Every branch here should throw ValidationError; the transactions array
 * asserted empty on a couple of cases proves nothing was written.
 */
describe("TradingService input validation", () => {
  it("rejects a buy with a negative or zero quantity", async () => {
    const { service, portfolio, transactions } = buildService(10_000);
    await expect(
      service.recordBuy(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: -1, pricePerUnit: 50, occurredAt },
        "corr-1"
      )
    ).rejects.toThrow();
    await expect(
      service.recordBuy(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 0, pricePerUnit: 50, occurredAt },
        "corr-2"
      )
    ).rejects.toThrow();
    expect(transactions.rows).toHaveLength(0);
  });

  it("rejects a buy with a negative or zero price", async () => {
    const { service, portfolio } = buildService(10_000);
    await expect(
      service.recordBuy(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: -50, occurredAt },
        "corr-1"
      )
    ).rejects.toThrow();
    await expect(
      service.recordBuy(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 0, occurredAt },
        "corr-2"
      )
    ).rejects.toThrow();
  });

  it("rejects a buy with a malformed date", async () => {
    const { service, portfolio } = buildService(10_000);
    await expect(
      service.recordBuy(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 50, occurredAt: "not-a-date" },
        "corr-1"
      )
    ).rejects.toThrow();
  });

  it("rejects a sell with a negative or zero quantity or price", async () => {
    const { service, portfolio } = buildService(10_000);
    await expect(
      service.recordSell(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: -1, pricePerUnit: 50, occurredAt },
        "corr-1"
      )
    ).rejects.toThrow();
    await expect(
      service.recordSell(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 0, occurredAt },
        "corr-2"
      )
    ).rejects.toThrow();
  });

  it("rejects a dividend with a negative or zero amount", async () => {
    const { service, portfolio } = buildService(10_000);
    await expect(
      service.recordDividend(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, amount: -10, occurredAt },
        "corr-1"
      )
    ).rejects.toThrow();
    await expect(
      service.recordDividend(
        OWNER,
        portfolio.id,
        { companyId: COMPANY_ID, amount: 0, occurredAt },
        "corr-2"
      )
    ).rejects.toThrow();
  });

  it("rejects a fee, interest, or tax with a negative or zero amount", async () => {
    const { service, portfolio } = buildService(10_000);
    await expect(
      service.recordFee(OWNER, portfolio.id, { amount: -10, occurredAt }, "corr-1")
    ).rejects.toThrow();
    await expect(
      service.recordInterest(OWNER, portfolio.id, { amount: 0, occurredAt }, "corr-2")
    ).rejects.toThrow();
    await expect(
      service.recordTax(OWNER, portfolio.id, { amount: -5, occurredAt }, "corr-3")
    ).rejects.toThrow();
  });

  it("rejects a cash adjustment with an unrecognised category", async () => {
    const { service, portfolio } = buildService(10_000);
    await expect(
      service.recordCashAdjustment(
        OWNER,
        portfolio.id,
        { category: "bonus", amount: 100, occurredAt }, // invalid category — input is `unknown`, so zod is the only gate
        "corr-1"
      )
    ).rejects.toThrow();
  });

  it("rejects every record call against a portfolio that does not exist", async () => {
    const { service } = buildService(10_000);
    await expect(
      service.recordBuy(
        OWNER,
        "missing-portfolio",
        { companyId: COMPANY_ID, quantity: 10, pricePerUnit: 50, occurredAt },
        "corr-1"
      )
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
