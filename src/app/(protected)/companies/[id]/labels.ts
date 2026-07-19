import type { InvestmentRating } from "@/domain/decision";
import type { ThesisStatementStatus } from "@/domain/thesis";

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
