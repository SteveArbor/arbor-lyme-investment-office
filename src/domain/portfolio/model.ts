import { z } from "zod";

/**
 * Portfolio holds positions and cash (docs/development-roadmap.md Phase 2,
 * item 6). Portfolio consumes research (via companyId); research never
 * depends on portfolio (docs/domain-driven-design.md's dependency rule).
 * Current value, unrealised gain/loss, and allocation are deliberately
 * NOT stored — they are computed on demand from a Holding plus a current
 * price supplied by the caller, since no market-data provider exists yet
 * (no invented data — docs/engineering-standards.md). Fair value and
 * conviction likewise are not duplicated here: they live in `valuation`
 * and `decision` respectively, referenced only by companyId.
 */

export const portfolioSchema = z.object({
  name: z.string().min(1, "Portfolio name is required").max(200),
  cash: z.number().min(0, "Cash cannot be negative"),
});

export type PortfolioInput = z.infer<typeof portfolioSchema>;

export interface Portfolio {
  id: string;
  ownerId: string;
  name: string;
  cash: number;
  createdAt: string;
  updatedAt: string;
}

export const portfolioUpdateSchema = portfolioSchema.partial();
export type PortfolioUpdate = z.infer<typeof portfolioUpdateSchema>;

export const holdingSchema = z.object({
  portfolioId: z.string().uuid(),
  companyId: z.string().uuid(),
  quantity: z.number().min(0, "Quantity cannot be negative"),
  averageCost: z.number().min(0, "Average cost cannot be negative"),
  targetAllocationPercent: z
    .number()
    .min(0)
    .max(1)
    .describe("Target share of total portfolio value, e.g. 0.05 = 5%"),
});

export type HoldingInput = z.infer<typeof holdingSchema>;

export interface Holding {
  id: string;
  ownerId: string;
  portfolioId: string;
  companyId: string;
  quantity: number;
  averageCost: number;
  targetAllocationPercent: number;
  createdAt: string;
  updatedAt: string;
}

export const holdingPositionSchema = z.object({
  quantity: z.number().min(0),
  averageCost: z.number().min(0),
});

export type HoldingPosition = z.infer<typeof holdingPositionSchema>;

export const holdingTargetAllocationSchema = z.object({
  targetAllocationPercent: z.number().min(0).max(1),
});

/** Market value of a position at a given current price. */
export function calculateCurrentValue(quantity: number, currentPrice: number): number {
  return quantity * currentPrice;
}

/** Unrealised gain/loss in absolute currency terms (positive = gain). */
export function calculateUnrealisedGainLoss(
  quantity: number,
  averageCost: number,
  currentPrice: number
): number {
  return quantity * (currentPrice - averageCost);
}

/** A position's current share of total portfolio value (holdings + cash). */
export function calculateCurrentAllocationPercent(
  currentValue: number,
  portfolioTotalValue: number
): number {
  if (portfolioTotalValue <= 0) return 0;
  return Math.min(1, Math.max(0, currentValue / portfolioTotalValue));
}
