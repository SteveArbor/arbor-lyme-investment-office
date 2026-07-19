import type { Metadata } from "next";

import { EmptyStateCard } from "@/components/ui/empty-state-card";

export const metadata: Metadata = {
  title: "Dashboard — Arbor Lyme Capital",
};

export default function DashboardPage() {
  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Investment Office
        </h1>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
          Foundation milestone
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        Authentication, settings, and audit are in place. Portfolio tracking, market data, and
        decision support are not built yet — see the development roadmap in the project
        documentation for what&apos;s next.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EmptyStateCard
          title="Portfolio summary"
          description="Holdings, value, and allocation will appear here once the portfolio and analytics domains are built."
          phase="Planned — Phases 2 & 4"
        />
        <EmptyStateCard
          title="Opportunities"
          description="Rule-driven signals and decision recommendations will appear here."
          phase="Planned — Phases 5 & 6"
        />
        <EmptyStateCard
          title="Daily briefing"
          description="An AI-assisted summary of your portfolio will appear here, built entirely from verified data."
          phase="Planned — Phase 10"
        />
      </div>
    </main>
  );
}
