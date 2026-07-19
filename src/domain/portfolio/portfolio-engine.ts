import { z } from "zod";

import { INVESTMENT_RATING_OPTIONS } from "@/domain/decision";

/**
 * The Portfolio Engine (ADR 0023, docs/decision-engine.md's "Portfolio
 * Action — A Separate, Downstream Concept"). Produces a PortfolioAction
 * from an InvestmentRating plus portfolio state — never the reverse, and
 * never re-deriving the rating itself. This is the one place
 * `PortfolioAction` is calculated; nothing else in the platform decides
 * what to do with a position.
 */

export const PORTFOLIO_ACTION_OPTIONS = [
  "initiate_position",
  "add",
  "hold",
  "trim",
  "exit",
] as const;

export type PortfolioAction = (typeof PORTFOLIO_ACTION_OPTIONS)[number];

export const portfolioActionInputsSchema = z.object({
  investmentRating: z.enum(INVESTMENT_RATING_OPTIONS),
  currentPositionValue: z
    .number()
    .min(0)
    .describe("Current market value of the position, 0 if not held"),
  portfolioTotalValue: z.number().min(0).describe("Total portfolio value: holdings + cash"),
  targetAllocationPercent: z.number().min(0).max(1),
  marginOfSafety: z.number().describe("Achieved margin of safety at the current price"),
  requiredMarginOfSafety: z
    .number()
    .describe("Minimum margin of safety required to buy, from valuation"),
  cashAvailable: z.number().describe("Cash available in the portfolio to fund a purchase"),
  maxPositionPercent: z
    .number()
    .min(0)
    .max(1)
    .describe("Risk limit: max allocation for any single position"),
});

export type PortfolioActionInputs = z.infer<typeof portfolioActionInputsSchema>;

/**
 * Deterministic mapping from an InvestmentRating plus portfolio state to a
 * PortfolioAction:
 *
 * - avoid/sell: exit if held, otherwise hold (nothing to unwind).
 * - reduce_conviction: trim if held, otherwise hold (do not initiate a
 *   position in something we no longer have full conviction in).
 * - hold: always hold — a neutral rating never changes the position.
 * - buy/strong_buy/exceptional: initiate or add, gated by every risk and
 *   capital constraint (already at/above target allocation, insufficient
 *   margin of safety, no cash available, at the single-position risk
 *   limit) — any one of which forces hold even on a strong rating.
 */
export function calculatePortfolioAction(inputs: PortfolioActionInputs): PortfolioAction {
  const isHeld = inputs.currentPositionValue > 0;
  const currentAllocationPercent =
    inputs.portfolioTotalValue > 0 ? inputs.currentPositionValue / inputs.portfolioTotalValue : 0;

  if (inputs.investmentRating === "avoid" || inputs.investmentRating === "sell") {
    return isHeld ? "exit" : "hold";
  }

  if (inputs.investmentRating === "reduce_conviction") {
    return isHeld ? "trim" : "hold";
  }

  if (inputs.investmentRating === "hold") {
    return "hold";
  }

  // buy / strong_buy / exceptional
  if (currentAllocationPercent >= inputs.targetAllocationPercent) return "hold";
  if (inputs.marginOfSafety < inputs.requiredMarginOfSafety) return "hold";
  if (inputs.cashAvailable <= 0) return "hold";
  if (currentAllocationPercent >= inputs.maxPositionPercent) return "hold";

  return isHeld ? "add" : "initiate_position";
}
