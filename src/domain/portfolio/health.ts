/**
 * Portfolio Health score (Phase 4). Deterministic and explainable — the
 * same philosophy `domain/decision`'s Investment Rating already
 * established (docs/decision-engine.md, ADR 0023): a weighted average of
 * named factors, each independently inspectable, never an opaque number.
 * Every threshold below is a documented starting point, not tuned
 * against real usage yet — the same convention ADR 0023's own thresholds
 * follow.
 */

export interface PortfolioHealthInput {
  /** Cash as a fraction of total portfolio value (holdings + cash). */
  cashPercent: number;
  holdingCount: number;
  /** The single largest holding's allocation, as a fraction of total portfolio value. */
  largestPositionPercent: number;
  largestSectorPercent: number;
  largestCountryPercent: number;
  /** Mean of `|allocationPercent - targetAllocationPercent|` across every holding with a target set. */
  averageAbsoluteDriftPercent: number;
  /** Fraction of portfolio value held in funds (OEIC/unit trust) — slower to settle than an exchange-traded sale, not "illiquid" in the sense of being unsellable. */
  fundPercent: number;
  /** Fraction of holdings with neither an Investment Rating nor a thesis recorded. */
  missingResearchPercent: number;
}

export const PORTFOLIO_HEALTH_FACTOR_KEYS = [
  "diversification",
  "cashAllocation",
  "sectorConcentration",
  "countryConcentration",
  "positionConcentration",
  "liquidity",
  "drift",
  "missingResearch",
] as const;
export type PortfolioHealthFactorKey = (typeof PORTFOLIO_HEALTH_FACTOR_KEYS)[number];

export interface PortfolioHealthFactor {
  key: PortfolioHealthFactorKey;
  label: string;
  /** 0–1, higher is better. */
  score: number;
  /** Sums to 1 across all factors. */
  weight: number;
  explanation: string;
}

export interface PortfolioHealthResult {
  /** 0–10, one decimal place. */
  score: number;
  factors: PortfolioHealthFactor[];
  summary: string;
}

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

/** Ideal cash range: enough to act on opportunities and cover near-term needs, not so much that it drags on returns. */
const CASH_TARGET_MIN = 0.05;
const CASH_TARGET_MAX = 0.15;

function scoreCashAllocation(cashPercent: number): number {
  if (cashPercent >= CASH_TARGET_MIN && cashPercent <= CASH_TARGET_MAX) return 1;
  if (cashPercent < CASH_TARGET_MIN) return normalize(cashPercent, 0, CASH_TARGET_MIN);
  return 1 - normalize(cashPercent, CASH_TARGET_MAX, 0.5);
}

const WEIGHTS: Record<PortfolioHealthFactorKey, number> = {
  diversification: 0.15,
  cashAllocation: 0.1,
  sectorConcentration: 0.15,
  countryConcentration: 0.1,
  positionConcentration: 0.2,
  liquidity: 0.1,
  drift: 0.1,
  missingResearch: 0.1,
};

export function calculatePortfolioHealth(input: PortfolioHealthInput): PortfolioHealthResult {
  const diversificationScore = normalize(input.holdingCount, 3, 20);
  const cashScore = scoreCashAllocation(input.cashPercent);
  const sectorScore = 1 - normalize(input.largestSectorPercent, 0.2, 0.6);
  const countryScore = 1 - normalize(input.largestCountryPercent, 0.5, 0.9);
  const positionScore = 1 - normalize(input.largestPositionPercent, 0.05, 0.2);
  // Funds are slower to settle, not unsellable -- a lenient band before penalising.
  const liquidityScore = 1 - normalize(input.fundPercent, 0.5, 0.9);
  const driftScore = 1 - normalize(input.averageAbsoluteDriftPercent, 0.02, 0.15);
  const missingResearchScore = 1 - input.missingResearchPercent;

  const factors: PortfolioHealthFactor[] = [
    {
      key: "diversification",
      label: "Diversification",
      score: diversificationScore,
      weight: WEIGHTS.diversification,
      explanation: `${input.holdingCount} holding${input.holdingCount === 1 ? "" : "s"} — more distinct positions spread single-company risk more thinly.`,
    },
    {
      key: "cashAllocation",
      label: "Cash allocation",
      score: cashScore,
      weight: WEIGHTS.cashAllocation,
      explanation: `Cash is ${(input.cashPercent * 100).toFixed(1)}% of the portfolio — the target range is ${CASH_TARGET_MIN * 100}–${CASH_TARGET_MAX * 100}%.`,
    },
    {
      key: "sectorConcentration",
      label: "Sector concentration",
      score: sectorScore,
      weight: WEIGHTS.sectorConcentration,
      explanation: `The largest sector is ${(input.largestSectorPercent * 100).toFixed(1)}% of the portfolio.`,
    },
    {
      key: "countryConcentration",
      label: "Country concentration",
      score: countryScore,
      weight: WEIGHTS.countryConcentration,
      explanation: `The largest country exposure is ${(input.largestCountryPercent * 100).toFixed(1)}% of the portfolio.`,
    },
    {
      key: "positionConcentration",
      label: "Single position concentration",
      score: positionScore,
      weight: WEIGHTS.positionConcentration,
      explanation: `The largest single holding is ${(input.largestPositionPercent * 100).toFixed(1)}% of the portfolio.`,
    },
    {
      key: "liquidity",
      label: "Liquidity",
      score: liquidityScore,
      weight: WEIGHTS.liquidity,
      explanation: `${(input.fundPercent * 100).toFixed(1)}% is held in funds (slower to settle than an exchange-traded sale).`,
    },
    {
      key: "drift",
      label: "Portfolio drift",
      score: driftScore,
      weight: WEIGHTS.drift,
      explanation: `Holdings sit ${(input.averageAbsoluteDriftPercent * 100).toFixed(1)}% away from target allocation on average.`,
    },
    {
      key: "missingResearch",
      label: "Missing research",
      score: missingResearchScore,
      weight: WEIGHTS.missingResearch,
      explanation: `${(input.missingResearchPercent * 100).toFixed(0)}% of holdings have no Investment Rating or thesis recorded yet.`,
    },
  ];

  const weightedScore = factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);
  const score = Math.round(weightedScore * 100) / 10;

  const weakest = [...factors].sort((a, b) => a.score - b.score)[0]!;
  const summary =
    score >= 8
      ? `Well balanced. ${weakest.label} is the area with the most room to improve.`
      : score >= 6
        ? `Generally sound, with ${weakest.label.toLowerCase()} worth attention.`
        : `${weakest.label} is meaningfully weighing on overall balance and worth addressing.`;

  return { score, factors, summary };
}
