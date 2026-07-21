import type { ConcentrationWarning } from "./risk";

/**
 * Portfolio Insights (Phase 4) — rule-based, deterministic observations
 * ("Use rules, not AI" per the brief). Deliberately reuses
 * `calculateConcentrationWarnings`'s output rather than recomputing
 * thresholds — sector/country/currency/position concentration is one
 * concern, computed once in `risk.ts`; this module only turns it (plus a
 * couple of portfolio-level facts) into plain-English observations.
 */
export const INSIGHT_SEVERITY_OPTIONS = ["info", "warning"] as const;
export type InsightSeverity = (typeof INSIGHT_SEVERITY_OPTIONS)[number];

export interface PortfolioInsight {
  message: string;
  severity: InsightSeverity;
}

export interface PortfolioInsightsInput {
  cashPercent: number;
  cashTargetPercent: number;
  concentrationWarnings: ConcentrationWarning[];
  /** Sectors at least one holding currently sits in. */
  heldSectors: string[];
  /**
   * A caller-supplied reference list of sectors worth explicitly flagging
   * if absent (e.g. `["Healthcare"]`) — deliberately not a hardcoded
   * exhaustive taxonomy inside this pure domain function; which sectors
   * are "worth watching for" is a policy decision the application layer
   * makes, not a fact this module invents.
   */
  watchedSectorsForGaps: string[];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function generatePortfolioInsights(input: PortfolioInsightsInput): PortfolioInsight[] {
  const insights: PortfolioInsight[] = [];

  if (input.cashPercent > input.cashTargetPercent) {
    insights.push({
      message: `Cash is ${formatPercent(input.cashPercent)} of the portfolio, above the ${formatPercent(input.cashTargetPercent)} target.`,
      severity: "info",
    });
  }

  for (const warning of input.concentrationWarnings) {
    if (warning.type === "sector") {
      insights.push({
        message: `${warning.key} is overweight at ${formatPercent(warning.percent)} of the portfolio.`,
        severity: "warning",
      });
    } else if (warning.type === "currency") {
      insights.push({
        message: `Large ${warning.key} exposure — ${formatPercent(warning.percent)} of the portfolio.`,
        severity: "warning",
      });
    } else if (warning.type === "position") {
      insights.push({
        message: `${warning.key} is a concentrated single position at ${formatPercent(warning.percent)}.`,
        severity: "warning",
      });
    } else if (warning.type === "country") {
      insights.push({
        message: `${warning.key} is a concentrated country exposure at ${formatPercent(warning.percent)}.`,
        severity: "warning",
      });
    }
  }

  const heldSectorSet = new Set(input.heldSectors);
  for (const sector of input.watchedSectorsForGaps) {
    if (!heldSectorSet.has(sector)) {
      insights.push({ message: `No ${sector} exposure.`, severity: "info" });
    }
  }

  if (input.concentrationWarnings.length >= 2) {
    insights.push({
      message:
        "Portfolio is becoming concentrated across more than one dimension — worth a closer look.",
      severity: "warning",
    });
  }

  if (insights.length === 0) {
    insights.push({ message: "No action required today.", severity: "info" });
  }

  return insights;
}
