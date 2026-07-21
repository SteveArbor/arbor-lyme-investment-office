import Link from "next/link";

import type { AllocationRow } from "@/application/services";
import { cardClasses } from "@/components/ui/form-styles";
import type {
  AllocationAction,
  ConcentrationWarning,
  ExposureBreakdown,
  Opportunity,
  OpportunityType,
  PortfolioHealthResult,
  PortfolioInsight,
} from "@/domain/portfolio";
import type { Transaction, TransactionType } from "@/domain/trading";
import {
  formatDate,
  formatPercent,
  formatSignedCurrency,
  formatSignedPercent,
  gainLossClasses,
} from "@/lib/format";

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
      {subtitle ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>
      ) : null}
    </div>
  );
}

/** A thin horizontal bar visualising a share of the whole — no charting library, deliberately (Phase 4 brief: dashboard quality, not a new dependency). */
function ShareBar({
  percent,
  className = "bg-neutral-700 dark:bg-neutral-300",
}: {
  percent: number;
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, percent * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function HealthScoreCard({ health }: { health: PortfolioHealthResult }) {
  const ringColor =
    health.score >= 8
      ? "text-emerald-600 dark:text-emerald-400"
      : health.score >= 6
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";
  return (
    <div className={cardClasses}>
      <SectionHeading title="Portfolio Health" />
      <div className="mt-3 flex flex-wrap items-center gap-6">
        <p className={`text-4xl font-bold tabular-nums ${ringColor}`}>
          {health.score.toFixed(1)}
          <span className="text-lg font-medium text-neutral-400 dark:text-neutral-600"> /10</span>
        </p>
        <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">{health.summary}</p>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {health.factors.map((factor) => (
          <div key={factor.key}>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                {factor.label}
              </dt>
              <dd className="text-xs text-neutral-500 tabular-nums dark:text-neutral-500">
                {Math.round(factor.score * 100)}%
              </dd>
            </div>
            <div className="mt-1">
              <ShareBar
                percent={factor.score}
                className={
                  factor.score >= 0.7
                    ? "bg-emerald-500"
                    : factor.score >= 0.4
                      ? "bg-amber-500"
                      : "bg-red-500"
                }
              />
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

const ACTION_LABELS: Record<AllocationAction, string> = {
  increase: "Increase",
  reduce: "Reduce",
  hold: "Hold",
  watch: "Watch",
};

const ACTION_CLASSES: Record<AllocationAction, string> = {
  increase: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  reduce: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  hold: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
  watch: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

function ActionBadge({ action }: { action: AllocationAction }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${ACTION_CLASSES[action]}`}
    >
      {ACTION_LABELS[action]}
    </span>
  );
}

export function AllocationAnalysisTable({
  rows,
  currency,
}: {
  rows: AllocationRow[];
  currency: string;
}) {
  const sorted = [...rows].sort(
    (a, b) => Math.abs(b.differencePercent) - Math.abs(a.differencePercent)
  );
  return (
    <div className={cardClasses}>
      <SectionHeading
        title="Allocation Analysis"
        subtitle={rows.length > 0 ? `${rows.length} holdings` : undefined}
      />
      {sorted.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          No holdings to analyse yet.
        </p>
      ) : (
        <div className="-mx-5 mt-3 overflow-x-auto px-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500 uppercase dark:border-neutral-800 dark:text-neutral-500">
                <th className="py-2 pr-3 font-medium">Company</th>
                <th className="py-2 pr-3 font-medium">Current</th>
                <th className="py-2 pr-3 font-medium">Target</th>
                <th className="py-2 pr-3 font-medium">Difference</th>
                <th className="py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, index) => (
                <tr
                  // Not just `row.companyId`: the same company can appear
                  // more than once when "All portfolios" combines holdings
                  // across portfolios without deduplicating by company
                  // (see buildPortfolioIntelligence's own doc comment) --
                  // the index tiebreaker keeps React's keys unique in that
                  // case without changing what's actually displayed.
                  key={`${row.companyId}-${index}`}
                  className="border-b border-neutral-100 last:border-0 dark:border-neutral-900"
                >
                  <td className="py-2 pr-3">
                    <Link
                      href={`/companies/${row.companyId}`}
                      className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                    >
                      {row.companyName}
                    </Link>
                    <span className="ml-1 text-neutral-500">({row.ticker})</span>
                  </td>
                  <td className="py-2 pr-3 text-neutral-700 tabular-nums dark:text-neutral-300">
                    {formatPercent(row.currentPercent)}
                  </td>
                  <td className="py-2 pr-3 text-neutral-700 tabular-nums dark:text-neutral-300">
                    {formatPercent(row.targetPercent)}
                  </td>
                  <td
                    className={`py-2 pr-3 tabular-nums ${gainLossClasses(-Math.abs(row.differencePercent))}`}
                  >
                    {formatSignedPercent(row.differencePercent)}
                  </td>
                  <td className="py-2">
                    <ActionBadge action={row.action} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-600">
        All figures relative to total portfolio value (holdings + cash); currency: {currency}.
      </p>
    </div>
  );
}

const OPPORTUNITY_LABELS: Record<OpportunityType, string> = {
  highest_conviction: "Highest conviction opportunity",
  largest_underweight: "Largest underweight position",
  largest_relative_discount: "Largest discount to target",
  recent_performer: "Most attractive recent performer",
  cash_deployment: "Cash available for deployment",
};

export function OpportunitiesPanel({ opportunities }: { opportunities: Opportunity[] }) {
  return (
    <div className={cardClasses}>
      <SectionHeading title="Opportunities" />
      {opportunities.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          Nothing stands out today — allocations are close to target and cash is deployed.
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {opportunities.map((opportunity, index) => (
            <li
              key={`${opportunity.type}-${index}`}
              className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
            >
              <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-500">
                {OPPORTUNITY_LABELS[opportunity.type]}
              </p>
              {opportunity.companyId ? (
                <Link
                  href={`/companies/${opportunity.companyId}`}
                  className="mt-1 block font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                >
                  {opportunity.headline}
                </Link>
              ) : (
                <p className="mt-1 font-medium text-neutral-900 dark:text-neutral-100">
                  {opportunity.headline}
                </p>
              )}
              <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                {opportunity.detail}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ExposureList({
  title,
  breakdown,
  highlightThreshold,
}: {
  title: string;
  breakdown: ExposureBreakdown[];
  highlightThreshold: number;
}) {
  const top = breakdown.slice(0, 5);
  return (
    <div>
      <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-500">
        {title}
      </h3>
      <ul className="mt-2 space-y-2">
        {top.map((item) => (
          <li key={item.key}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-neutral-700 dark:text-neutral-300">{item.key}</span>
              <span
                className={`tabular-nums ${item.percent > highlightThreshold ? "font-semibold text-amber-700 dark:text-amber-400" : "text-neutral-500 dark:text-neutral-500"}`}
              >
                {formatPercent(item.percent)}
              </span>
            </div>
            <div className="mt-1">
              <ShareBar
                percent={item.percent}
                className={item.percent > highlightThreshold ? "bg-amber-500" : "bg-neutral-500"}
              />
            </div>
          </li>
        ))}
        {top.length === 0 ? (
          <li className="text-sm text-neutral-500 dark:text-neutral-400">No holdings yet.</li>
        ) : null}
      </ul>
    </div>
  );
}

export function RiskOverviewPanel({
  sectorAllocation,
  countryAllocation,
  currencyExposure,
  concentrationWarnings,
}: {
  sectorAllocation: ExposureBreakdown[];
  countryAllocation: ExposureBreakdown[];
  currencyExposure: ExposureBreakdown[];
  concentrationWarnings: ConcentrationWarning[];
}) {
  return (
    <div className={cardClasses}>
      <SectionHeading title="Risk Overview" />
      <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <ExposureList
          title="Sector allocation"
          breakdown={sectorAllocation}
          highlightThreshold={0.3}
        />
        <ExposureList
          title="Country allocation"
          breakdown={countryAllocation}
          highlightThreshold={0.6}
        />
        <ExposureList
          title="Currency exposure"
          breakdown={currencyExposure}
          highlightThreshold={0.6}
        />
      </div>
      {concentrationWarnings.length > 0 ? (
        <div className="mt-5 border-t border-neutral-200 pt-4 dark:border-neutral-800">
          <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-500">
            Concentration warnings
          </h3>
          <ul className="mt-2 space-y-1.5">
            {concentrationWarnings.map((warning, index) => (
              <li
                key={`${warning.type}-${warning.key}-${index}`}
                className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-400"
              >
                <span aria-hidden="true">⚠</span>
                <span>{warning.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-5 border-t border-neutral-200 pt-4 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          No concentration warnings — exposures sit within guideline ranges.
        </p>
      )}
    </div>
  );
}

export function InsightsPanel({ insights }: { insights: PortfolioInsight[] }) {
  return (
    <div className={cardClasses}>
      <SectionHeading title="Portfolio Insights" />
      <ul className="mt-3 space-y-2">
        {insights.map((insight, index) => (
          <li
            key={index}
            className={`flex items-start gap-2 text-sm ${
              insight.severity === "warning"
                ? "text-amber-800 dark:text-amber-400"
                : "text-neutral-700 dark:text-neutral-300"
            }`}
          >
            <span aria-hidden="true">{insight.severity === "warning" ? "⚠" : "•"}</span>
            <span>{insight.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ACTIVITY_LABELS: Record<TransactionType, string> = {
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  fee: "Fee",
  interest: "Interest",
  tax: "Tax",
  cash_adjustment: "Cash movement",
};

export function RecentActivityPanel({
  transactions,
  companyNameById,
  currency,
}: {
  transactions: Transaction[];
  companyNameById: Map<string, string>;
  currency: string;
}) {
  const recent = [...transactions]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .slice(0, 8);
  return (
    <div className={cardClasses}>
      <SectionHeading title="Recent Activity" />
      {recent.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          No transactions recorded yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {recent.map((transaction) => (
            <li
              key={transaction.id}
              className="flex items-center justify-between gap-2 border-b border-neutral-100 pb-2 text-sm last:border-0 dark:border-neutral-900"
            >
              <div>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {ACTIVITY_LABELS[transaction.type]}
                </span>
                {transaction.companyId ? (
                  <span className="ml-1 text-neutral-600 dark:text-neutral-400">
                    {companyNameById.get(transaction.companyId) ?? transaction.companyId}
                  </span>
                ) : null}
                <span className="ml-2 text-xs text-neutral-400 dark:text-neutral-600">
                  {formatDate(transaction.occurredAt)}
                </span>
              </div>
              <span className={`tabular-nums ${gainLossClasses(transaction.amount)}`}>
                {formatSignedCurrency(transaction.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function UpcomingEventsPanel() {
  return (
    <div className={cardClasses}>
      <SectionHeading title="Upcoming Events" />
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
        Manual entry and vendor feeds for these are planned; nothing is fabricated here yet.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { title: "Upcoming earnings", phase: "Planned — future milestone" },
          { title: "Dividend dates", phase: "Planned — future milestone" },
          { title: "Economic events", phase: "Planned — future milestone" },
          { title: "Review reminders", phase: "Planned — Phase 4 follow-up" },
        ].map((placeholder) => (
          <div
            key={placeholder.title}
            className="rounded-md border border-dashed border-neutral-300 p-3 dark:border-neutral-700"
          >
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {placeholder.title}
            </p>
            <p className="mt-1 text-xs font-medium tracking-wide text-neutral-400 uppercase dark:text-neutral-600">
              {placeholder.phase}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface JournalCompletenessRow {
  companyId: string;
  companyName: string;
  ticker: string;
  completePercent: number;
  missingLabels: string[];
  hasEntry: boolean;
}

export function JournalIntegrationPanel({ rows }: { rows: JournalCompletenessRow[] }) {
  return (
    <div className={cardClasses}>
      <SectionHeading
        title="Investment Journal"
        subtitle={rows.length > 0 ? `${rows.length} holdings` : undefined}
      />
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
          No holdings to journal yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.companyId}
              className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 last:border-0 dark:border-neutral-900"
            >
              <div className="min-w-0">
                <Link
                  href={`/companies/${row.companyId}/journal`}
                  className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                >
                  {row.companyName} ({row.ticker})
                </Link>
                {!row.hasEntry ? (
                  <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                    No journal entry recorded — add one to capture the thesis behind this position.
                  </p>
                ) : row.missingLabels.length > 0 ? (
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    Missing: {row.missingLabels.join(", ")}
                  </p>
                ) : null}
              </div>
              <div className="flex w-28 shrink-0 items-center gap-2">
                <ShareBar
                  percent={row.completePercent}
                  className={
                    row.completePercent >= 0.85
                      ? "bg-emerald-500"
                      : row.completePercent >= 0.5
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }
                />
                <span className="w-9 shrink-0 text-right text-xs text-neutral-500 tabular-nums dark:text-neutral-500">
                  {Math.round(row.completePercent * 100)}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
