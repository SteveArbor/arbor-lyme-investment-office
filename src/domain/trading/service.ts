import type { HoldingRepository, PortfolioRepository } from "@/domain/portfolio";
import {
  ConflictError,
  createDomainEvent,
  type DomainEvent,
  NotFoundError,
  ValidationError,
} from "@/domain/shared";

import {
  buyInputSchema,
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
 * Portfolio: it still reads `HoldingRepository`/`PortfolioRepository` for a
 * pre-flight check (sufficient cash, sufficient holding to sell) so a
 * malformed request fails fast with a clear message before a round trip —
 * but that check is advisory UX only. The resulting holding quantity,
 * average cost, and any realised gain are no longer computed here: they're
 * computed inside the same locked database call that writes them
 * (docs/implementation/staff-engineer-review.md findings H1/H2), from
 * state read after the lock is held, which is what makes the pre-flight
 * check here safe to be stale under concurrency — the database re-checks
 * authoritatively regardless of what this method already decided.
 * `TransactionRepository`'s implementation maps the database's own
 * rejection (a concurrent sale making this buy's pre-flight check
 * outdated, for instance) to the same typed errors this method throws
 * directly, so a caller never needs to know which layer caught it.
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
      throw new ConflictError("Insufficient cash for this purchase", {
        amount: [`Requires ${cost}, portfolio has ${portfolio.cash} available`],
      });
    }

    const transaction = await this.transactions.recordBuy(ownerId, {
      portfolioId,
      companyId,
      quantity,
      pricePerUnit,
      occurredAt,
      notes: notes ?? null,
      idempotencyKey: correlationId,
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
      throw new ConflictError("Insufficient holding to sell", {
        quantity: [`Holding has ${existing?.quantity ?? 0}, cannot sell ${quantity}`],
      });
    }

    const transaction = await this.transactions.recordSell(ownerId, {
      portfolioId,
      companyId,
      quantity,
      pricePerUnit,
      occurredAt,
      notes: notes ?? null,
      idempotencyKey: correlationId,
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
      idempotencyKey: correlationId,
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
      throw new ConflictError("Cash adjustment would make the portfolio balance negative", {
        amount: [`Portfolio has ${portfolio.cash}, cannot adjust by ${amount}`],
      });
    }

    const transaction = await this.transactions.recordCashAdjustment(ownerId, {
      portfolioId,
      amount,
      occurredAt,
      notes: notes ?? null,
      idempotencyKey: correlationId,
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
