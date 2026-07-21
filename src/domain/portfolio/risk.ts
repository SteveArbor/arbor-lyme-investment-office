/**
 * Risk Overview (Phase 4). Pure, framework-free aggregation over
 * caller-supplied holding data — no fetching, matching every other file
 * in this domain (`performance.ts`'s own doc comment). Sector/country/
 * currency are facts about the *company* (`domain/company`), joined in
 * by the application-layer composer the same way `performance.ts`'s
 * `currency`/`fxRateToBase` already are.
 */

export interface RiskHoldingInput {
  companyId: string;
  companyName: string;
  sector: string;
  country: string;
  currency: string;
  /** Market value in the portfolio's base currency (already converted — ADR 0032). */
  marketValueBase: number;
}

export interface ExposureBreakdown {
  key: string;
  valueBase: number;
  /** Of total portfolio value (holdings + cash) — cash itself carries no sector/country but is real base-currency exposure, so it's folded into currency exposure only, never sector/country (see `calculateCurrencyExposure`). */
  percent: number;
}

function aggregateBy(
  holdings: RiskHoldingInput[],
  keyFn: (holding: RiskHoldingInput) => string,
  totalPortfolioValue: number
): ExposureBreakdown[] {
  const totals = new Map<string, number>();
  for (const holding of holdings) {
    const key = keyFn(holding);
    totals.set(key, (totals.get(key) ?? 0) + holding.marketValueBase);
  }
  return [...totals.entries()]
    .map(([key, valueBase]) => ({
      key,
      valueBase,
      percent: totalPortfolioValue > 0 ? valueBase / totalPortfolioValue : 0,
    }))
    .sort((a, b) => b.valueBase - a.valueBase);
}

export function calculateSectorAllocation(
  holdings: RiskHoldingInput[],
  totalPortfolioValue: number
): ExposureBreakdown[] {
  return aggregateBy(holdings, (h) => h.sector, totalPortfolioValue);
}

export function calculateCountryAllocation(
  holdings: RiskHoldingInput[],
  totalPortfolioValue: number
): ExposureBreakdown[] {
  return aggregateBy(holdings, (h) => h.country, totalPortfolioValue);
}

/** Cash is real exposure to the base currency — folded into the base-currency bucket here, unlike sector/country (which cash has neither of). */
export function calculateCurrencyExposure(
  holdings: RiskHoldingInput[],
  cash: number,
  baseCurrency: string,
  totalPortfolioValue: number
): ExposureBreakdown[] {
  const totals = new Map<string, number>();
  for (const holding of holdings) {
    totals.set(holding.currency, (totals.get(holding.currency) ?? 0) + holding.marketValueBase);
  }
  totals.set(baseCurrency, (totals.get(baseCurrency) ?? 0) + cash);
  return [...totals.entries()]
    .map(([key, valueBase]) => ({
      key,
      valueBase,
      percent: totalPortfolioValue > 0 ? valueBase / totalPortfolioValue : 0,
    }))
    .sort((a, b) => b.valueBase - a.valueBase);
}

/**
 * Guideline thresholds (percent of total portfolio value) above which a
 * concentration is flagged — a documented starting point, not tuned
 * against real usage yet (same convention as ADR 0023's rating
 * thresholds). Country/currency allow more concentration than
 * sector/position before flagging: a UK-based investor holding mostly
 * UK/US assets in GBP/USD is normal, not itself a red flag, the way a
 * single sector or single position dominating the book would be.
 */
export const CONCENTRATION_THRESHOLDS = {
  position: 0.15,
  sector: 0.3,
  country: 0.6,
  currency: 0.6,
} as const;

export const CONCENTRATION_WARNING_TYPES = ["position", "sector", "country", "currency"] as const;
export type ConcentrationWarningType = (typeof CONCENTRATION_WARNING_TYPES)[number];

export interface ConcentrationWarning {
  type: ConcentrationWarningType;
  key: string;
  percent: number;
  message: string;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function calculateConcentrationWarnings(
  positionBreakdown: Array<{ companyName: string; percent: number }>,
  sectorBreakdown: ExposureBreakdown[],
  countryBreakdown: ExposureBreakdown[],
  currencyBreakdown: ExposureBreakdown[]
): ConcentrationWarning[] {
  const warnings: ConcentrationWarning[] = [];

  for (const position of positionBreakdown) {
    if (position.percent > CONCENTRATION_THRESHOLDS.position) {
      warnings.push({
        type: "position",
        key: position.companyName,
        percent: position.percent,
        message: `${position.companyName} is ${formatPercent(position.percent)} of the portfolio — above the ${formatPercent(CONCENTRATION_THRESHOLDS.position)} single-position guideline.`,
      });
    }
  }
  for (const sector of sectorBreakdown) {
    if (sector.percent > CONCENTRATION_THRESHOLDS.sector) {
      warnings.push({
        type: "sector",
        key: sector.key,
        percent: sector.percent,
        message: `${sector.key} is ${formatPercent(sector.percent)} of the portfolio — above the ${formatPercent(CONCENTRATION_THRESHOLDS.sector)} sector guideline.`,
      });
    }
  }
  for (const country of countryBreakdown) {
    if (country.percent > CONCENTRATION_THRESHOLDS.country) {
      warnings.push({
        type: "country",
        key: country.key,
        percent: country.percent,
        message: `${country.key} is ${formatPercent(country.percent)} of the portfolio — above the ${formatPercent(CONCENTRATION_THRESHOLDS.country)} country guideline.`,
      });
    }
  }
  for (const currency of currencyBreakdown) {
    if (currency.percent > CONCENTRATION_THRESHOLDS.currency) {
      warnings.push({
        type: "currency",
        key: currency.key,
        percent: currency.percent,
        message: `${currency.key} exposure is ${formatPercent(currency.percent)} of the portfolio — above the ${formatPercent(CONCENTRATION_THRESHOLDS.currency)} currency guideline.`,
      });
    }
  }

  return warnings.sort((a, b) => b.percent - a.percent);
}
