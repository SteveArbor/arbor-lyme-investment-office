import { z } from "zod";

/**
 * The transaction ledger (docs/development-roadmap.md Phase 2, item 7;
 * cash management expanded in Milestone 2.7, ADR 0026): buy, sell,
 * dividend, fee, interest, tax, cash adjustment. Append-only — a
 * transaction is never edited or deleted, matching
 * decision_recommendations' immutability model (docs/audit-strategy.md).
 * Average cost and realised gain are calculated here, purely, from the
 * transaction and the position it applies to; unrealised gain is
 * deliberately NOT recalculated here — it already exists as
 * `calculateUnrealisedGainLoss` in `domain/portfolio` and is reused, not
 * duplicated (docs/development-roadmap.md's "no duplicated logic" rule).
 */

export const TRANSACTION_TYPE_OPTIONS = [
  "buy",
  "sell",
  "dividend",
  "fee",
  "interest",
  "tax",
  "cash_adjustment",
] as const;

export type TransactionType = (typeof TRANSACTION_TYPE_OPTIONS)[number];

/**
 * Only meaningful when `type` is `cash_adjustment` — the four adjustment
 * kinds that don't already have a dedicated transaction type (dividend/
 * fee/interest/tax cover the rest — see ADR 0026 and this migration's own
 * header comment for why this is two classification axes, not eight
 * top-level types).
 */
export const CASH_ADJUSTMENT_CATEGORY_OPTIONS = [
  "deposit",
  "withdrawal",
  "correction",
  "other",
] as const;

export type CashAdjustmentCategory = (typeof CASH_ADJUSTMENT_CATEGORY_OPTIONS)[number];

const notesField = z.string().max(2_000).nullable().optional();
const referenceField = z.string().max(200).nullable().optional();

export const buyInputSchema = z.object({
  companyId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be greater than zero"),
  pricePerUnit: z.number().positive("Price must be greater than zero"),
  occurredAt: z.string().datetime(),
  notes: notesField,
});

export type BuyInput = z.infer<typeof buyInputSchema>;

export const sellInputSchema = z.object({
  companyId: z.string().uuid(),
  quantity: z.number().positive("Quantity must be greater than zero"),
  pricePerUnit: z.number().positive("Price must be greater than zero"),
  occurredAt: z.string().datetime(),
  notes: notesField,
});

export type SellInput = z.infer<typeof sellInputSchema>;

export const dividendInputSchema = z.object({
  companyId: z.string().uuid(),
  amount: z.number().positive("Dividend amount must be greater than zero"),
  occurredAt: z.string().datetime(),
  notes: notesField,
  reference: referenceField,
});

export type DividendInput = z.infer<typeof dividendInputSchema>;

export const feeInputSchema = z.object({
  companyId: z.string().uuid().nullable().optional(),
  amount: z.number().positive("Fee amount must be greater than zero"),
  occurredAt: z.string().datetime(),
  notes: notesField,
  reference: referenceField,
});

export type FeeInput = z.infer<typeof feeInputSchema>;

export const interestInputSchema = z.object({
  amount: z.number().positive("Interest amount must be greater than zero"),
  occurredAt: z.string().datetime(),
  notes: notesField,
  reference: referenceField,
});

export type InterestInput = z.infer<typeof interestInputSchema>;

export const taxInputSchema = z.object({
  companyId: z.string().uuid().nullable().optional(),
  amount: z.number().positive("Tax amount must be greater than zero"),
  occurredAt: z.string().datetime(),
  notes: notesField,
  reference: referenceField,
});

export type TaxInput = z.infer<typeof taxInputSchema>;

export const cashAdjustmentInputSchema = z.object({
  category: z.enum(CASH_ADJUSTMENT_CATEGORY_OPTIONS),
  amount: z.number().refine((value) => value !== 0, "Amount cannot be zero"),
  occurredAt: z.string().datetime(),
  notes: notesField,
  reference: referenceField,
});

export type CashAdjustmentInput = z.infer<typeof cashAdjustmentInputSchema>;

export interface Transaction {
  id: string;
  ownerId: string;
  portfolioId: string;
  companyId: string | null; // null unless buy/sell/dividend, or fee/tax optionally tagged to a company
  type: TransactionType;
  category: CashAdjustmentCategory | null; // cash_adjustment only
  quantity: number | null; // buy/sell only
  pricePerUnit: number | null; // buy/sell only
  amount: number; // signed cash effect
  realisedGain: number | null; // sell only
  occurredAt: string;
  notes: string | null;
  reference: string | null;
  createdAt: string;
}

/**
 * Weighted-average cost after a buy: the standard average-cost-basis
 * method — existing shares and new shares blended by quantity. Selling
 * never changes average cost for the shares that remain.
 */
export function calculateWeightedAverageCost(
  existingQuantity: number,
  existingAverageCost: number,
  buyQuantity: number,
  buyPrice: number
): number {
  const totalQuantity = existingQuantity + buyQuantity;
  if (totalQuantity <= 0) return 0;
  return (existingQuantity * existingAverageCost + buyQuantity * buyPrice) / totalQuantity;
}

/** Realised gain/loss on the shares sold, against their average cost basis. */
export function calculateRealisedGain(
  sellQuantity: number,
  sellPrice: number,
  averageCost: number
): number {
  return sellQuantity * (sellPrice - averageCost);
}

export interface TransactionWithBalance {
  transaction: Transaction;
  /** Portfolio cash immediately after this transaction was applied. */
  balanceAfter: number;
}

/**
 * No transaction row stores a running balance (append-only ledger, ADR
 * 0025/0026 — a stored balance would be a second, driftable copy of what
 * the ledger itself already determines). The Cash History view needs one
 * anyway, so it's derived here, working backward from the portfolio's
 * current cash: `transactions` must be the *complete* history for the
 * portfolio, newest first (`listByPortfolioId`'s natural order) — every
 * type affects cash (buy/sell included), not just the cash-management
 * types a Cash History view might filter down to for display, so this
 * must run over the unfiltered list before any UI-level filtering happens.
 */
export function computeTransactionsWithRunningBalance(
  currentCash: number,
  transactionsNewestFirst: Transaction[]
): TransactionWithBalance[] {
  let runningBalance = currentCash;
  const result: TransactionWithBalance[] = [];
  for (const transaction of transactionsNewestFirst) {
    result.push({ transaction, balanceAfter: runningBalance });
    runningBalance -= transaction.amount;
  }
  return result;
}
