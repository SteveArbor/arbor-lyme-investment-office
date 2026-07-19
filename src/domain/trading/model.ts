import { z } from "zod";

/**
 * The transaction ledger (docs/development-roadmap.md Phase 2, item 7):
 * buy, sell, dividend, cash adjustment. Append-only — a transaction is
 * never edited or deleted, matching decision_recommendations' immutability
 * model (docs/audit-strategy.md). Average cost and realised gain are
 * calculated here, purely, from the transaction and the position it
 * applies to; unrealised gain is deliberately NOT recalculated here — it
 * already exists as `calculateUnrealisedGainLoss` in `domain/portfolio`
 * and is reused, not duplicated (docs/development-roadmap.md's "no
 * duplicated logic" rule).
 */

export const TRANSACTION_TYPE_OPTIONS = ["buy", "sell", "dividend", "cash_adjustment"] as const;

export type TransactionType = (typeof TRANSACTION_TYPE_OPTIONS)[number];

const notesField = z.string().max(2_000).nullable().optional();

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
});

export type DividendInput = z.infer<typeof dividendInputSchema>;

export const cashAdjustmentInputSchema = z.object({
  amount: z.number().refine((value) => value !== 0, "Amount cannot be zero"),
  occurredAt: z.string().datetime(),
  notes: notesField,
});

export type CashAdjustmentInput = z.infer<typeof cashAdjustmentInputSchema>;

export interface Transaction {
  id: string;
  ownerId: string;
  portfolioId: string;
  companyId: string | null; // null only for cash_adjustment
  type: TransactionType;
  quantity: number | null; // buy/sell only
  pricePerUnit: number | null; // buy/sell only
  amount: number; // signed cash effect: buy negative, sell/dividend positive, cash_adjustment signed
  realisedGain: number | null; // sell only
  occurredAt: string;
  notes: string | null;
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
