import type { InvestmentRating } from "@/domain/decision";
import type { PortfolioAction } from "@/domain/portfolio";
import type { ThesisStatementStatus } from "@/domain/thesis";
import type { ValuationStatus } from "@/domain/valuation";

export const RATING_LABELS: Record<InvestmentRating, string> = {
  exceptional: "Exceptional",
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  reduce_conviction: "Reduce Conviction",
  sell: "Sell",
  avoid: "Avoid",
};

export const THESIS_STATUS_LABELS: Record<ThesisStatementStatus, string> = {
  strengthening: "Strengthening",
  stable: "Stable",
  weakening: "Weakening",
  broken: "Broken",
};

export const VALUATION_STATUS_LABELS: Record<ValuationStatus, string> = {
  undervalued: "Undervalued",
  fairly_valued: "Fairly Valued",
  overvalued: "Overvalued",
};

export const PORTFOLIO_ACTION_LABELS: Record<PortfolioAction, string> = {
  initiate_position: "Initiate Position",
  add: "Add",
  hold: "Hold",
  trim: "Trim",
  exit: "Exit",
};
