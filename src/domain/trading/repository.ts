import type { Transaction, TransactionType } from "./model";

export interface CreateTransactionData {
  portfolioId: string;
  companyId: string | null;
  type: TransactionType;
  quantity: number | null;
  pricePerUnit: number | null;
  amount: number;
  realisedGain: number | null;
  occurredAt: string;
  notes: string | null;
}

/** Interface only — implemented in infrastructure/database. Append-only: no update or delete. */
export interface TransactionRepository {
  create(ownerId: string, data: CreateTransactionData): Promise<Transaction>;
  listByPortfolioId(ownerId: string, portfolioId: string): Promise<Transaction[]>;
  listByCompanyId(ownerId: string, portfolioId: string, companyId: string): Promise<Transaction[]>;
}
