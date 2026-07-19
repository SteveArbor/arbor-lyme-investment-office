import type { HoldingRepository, PortfolioRepository } from "@/domain/portfolio";
import {
  createDomainEvent,
  type DomainEvent,
  NotFoundError,
  ValidationError,
} from "@/domain/shared";

import {
  buyInputSchema,
  calculateRealisedGain,
  calculateWeightedAverageCost,
  cashAdjustmentInputSchema,
  dividendInputSchema,
  sellInputSchema,
  type Transaction,
} from "./model";
import type { TransactionRepository } from "./repository";

export interface TransactionRecordedPayload {
  transactionId: string;
  portfolioId: string;
  companyId: string | null;
  type: string;
  amount: number;
}

/**
 * The transaction ledger's business logic (docs/development-roadmap.md
 * Phase 2, item 7). Framework-independent. Trading is downstream of
 * Portfolio: it still reads `HoldingRepository`/`PortfolioRepository` to
 * validate (sufficient cash, sufficient holding to sell) and to compute
 * the resulting average cost/realised gain via the pure functions below —
 * but the actual write is a single atomic call into
 * `TransactionRepository` (Phase 2 Architecture Review finding 4.1), never
 * three separate writes this service could partially apply.
 */
export class TradingService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly holdings: HoldingRepository,
    private readonly portfolios: PortfolioRepository
  ) {}

  async recordBuy(
    ownerId: string,
    portfolioId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ transaction: Transaction; event: DomainEvent<TransactionRecordedPayload> }> {
    const parsed = buyInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid buy transaction",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }
    const { companyId, quantity, pricePerUnit, occurredAt, notes } = parsed.data;

    const portfolio = await this.portfolios.getById(ownerId, portfolioId);
    if (!portfolio) throw new NotFoundError("Portfolio", portfolioId);

    const cost = quantity * pricePerUnit;
    if (cost > portfolio.cash) {
      throw new ValidationError("Insufficient cash for this purchase", {
        amount: [`Requires ${cost}, portfolio has ${portfolio.cash} available`],
      });
    }

    const existing = await this.holdings.getByCompanyId(ownerId, portfolioId, companyId);
    const newQuantity = (existing?.quantity ?? 0) + quantity;
    const newAverageCost = calculateWeightedAverageCost(
      existing?.quantity ?? 0,
      existing?.averageCost ?? 0,
      quantity,
      pricePerUnit
    );

    const transaction = await this.transactions.recordBuy(ownerId, {
      portfolioId,
      companyId,
      quantity,
      pricePerUnit,
      occurredAt,
      notes: notes ?? null,
      newHoldingQuantity: newQuantity,
      newHoldingAverageCost: newAverageCost,
    });

    return { transaction, event: this.toEvent(transaction, correlationId, ownerId) };
  }

  async recordSell(
    ownerId: string,
    portfolioId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ transaction: Transaction; event: DomainEvent<TransactionRecordedPayload> }> {
    const parsed = sellInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid sell transaction",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }
    const { companyId, quantity, pricePerUnit, occurredAt, notes } = parsed.data;

    const portfolio = await this.portfolios.getById(ownerId, portfolioId);
    if (!portfolio) throw new NotFoundError("Portfolio", portfolioId);

    const existing = await this.holdings.getByCompanyId(ownerId, portfolioId, companyId);
    if (!existing || existing.quantity < quantity) {
      throw new ValidationError("Insufficient holding to sell", {
        quantity: [`Holding has ${existing?.quantity ?? 0}, cannot sell ${quantity}`],
      });
    }

    const realisedGain = calculateRealisedGain(quantity, pricePerUnit, existing.averageCost);
    const newQuantity = existing.quantity - quantity;

    const transaction = await this.transactions.recordSell(ownerId, {
      portfolioId,
      companyId,
      quantity,
      pricePerUnit,
      occurredAt,
      notes: notes ?? null,
      newHoldingQuantity: newQuantity,
      newHoldingAverageCost: newQuantity > 0 ? existing.averageCost : 0,
      realisedGain,
    });

    return { transaction, event: this.toEvent(transaction, correlationId, ownerId) };
  }

  async recordDividend(
    ownerId: string,
    portfolioId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ transaction: Transaction; event: DomainEvent<TransactionRecordedPayload> }> {
    const parsed = dividendInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid dividend transaction",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }
    const { companyId, amount, occurredAt, notes } = parsed.data;

    const portfolio = await this.portfolios.getById(ownerId, portfolioId);
    if (!portfolio) throw new NotFoundError("Portfolio", portfolioId);

    const transaction = await this.transactions.recordDividend(ownerId, {
      portfolioId,
      companyId,
      amount,
      occurredAt,
      notes: notes ?? null,
    });

    return { transaction, event: this.toEvent(transaction, correlationId, ownerId) };
  }

  async recordCashAdjustment(
    ownerId: string,
    portfolioId: string,
    input: unknown,
    correlationId: string
  ): Promise<{ transaction: Transaction; event: DomainEvent<TransactionRecordedPayload> }> {
    const parsed = cashAdjustmentInputSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid cash adjustment",
        parsed.error.flatten().fieldErrors as Record<string, string[]>
      );
    }
    const { amount, occurredAt, notes } = parsed.data;

    const portfolio = await this.portfolios.getById(ownerId, portfolioId);
    if (!portfolio) throw new NotFoundError("Portfolio", portfolioId);

    if (portfolio.cash + amount < 0) {
      throw new ValidationError("Cash adjustment would make the portfolio balance negative", {
        amount: [`Portfolio has ${portfolio.cash}, cannot adjust by ${amount}`],
      });
    }

    const transaction = await this.transactions.recordCashAdjustment(ownerId, {
      portfolioId,
      amount,
      occurredAt,
      notes: notes ?? null,
    });

    return { transaction, event: this.toEvent(transaction, correlationId, ownerId) };
  }

  async listTransactions(ownerId: string, portfolioId: string): Promise<Transaction[]> {
    return this.transactions.listByPortfolioId(ownerId, portfolioId);
  }

  async listTransactionsForCompany(
    ownerId: string,
    portfolioId: string,
    companyId: string
  ): Promise<Transaction[]> {
    return this.transactions.listByCompanyId(ownerId, portfolioId, companyId);
  }

  private toEvent(
    transaction: Transaction,
    correlationId: string,
    actorId: string
  ): DomainEvent<TransactionRecordedPayload> {
    return createDomainEvent<TransactionRecordedPayload>({
      type: "TransactionRecorded",
      actorId,
      correlationId,
      payload: {
        transactionId: transaction.id,
        portfolioId: transaction.portfolioId,
        companyId: transaction.companyId,
        type: transaction.type,
        amount: transaction.amount,
      },
    });
  }
}
