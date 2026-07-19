import type { Metadata } from "next";
import Link from "next/link";

import { buildCompanyMonitoringSnapshot, composeAppServices } from "@/application/services";
import { EmptyStateCard } from "@/components/ui/empty-state-card";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { RATING_LABELS, THESIS_STATUS_LABELS } from "../companies/[id]/labels";

export const metadata: Metadata = {
  title: "Dashboard — Arbor Lyme Capital",
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const services = composeAppServices(supabase);
  const companies = await services.companyService.listCompanies(user!.id);
  const snapshots = await Promise.all(
    companies.map((company) => buildCompanyMonitoringSnapshot(services, user!.id, company.id))
  );

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          Monitoring Dashboard
        </h1>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-neutral-600 dark:text-neutral-400">
        Per-company thesis status, valuation, and Investment Rating — assembled from research,
        thesis, valuation, and decision, each already written once in its own domain.
      </p>

      {companies.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            No companies tracked yet.{" "}
            <Link href="/companies/new" className="underline">
              Add one
            </Link>{" "}
            to populate this dashboard.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium tracking-wide text-neutral-600 uppercase dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-3">Company</th>
                <th className="px-4 py-3">Thesis</th>
                <th className="px-4 py-3">Fair value</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Open journal entry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {companies.map((company, index) => {
                const snapshot = snapshots[index];
                return (
                  <tr key={company.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-900/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/companies/${company.id}`}
                        className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                      >
                        {company.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {THESIS_STATUS_LABELS[snapshot.thesisStatus]}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {snapshot.blendedFairValue.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {snapshot.latestRating ? RATING_LABELS[snapshot.latestRating] : "Not rated"}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                      {snapshot.openJournalEntry ? "Yes" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EmptyStateCard
          title="Daily briefing"
          description="An AI-assisted summary of your portfolio will appear here, built entirely from verified data."
          phase="Planned — Phase 4"
        />
        <EmptyStateCard
          title="Alerts"
          description="Rule-driven signals and rating-change notifications will appear here."
          phase="Planned — Phase 5"
        />
        <EmptyStateCard
          title="Reporting & benchmarking"
          description="Exportable period reports and benchmark comparisons will appear here."
          phase="Planned — Phase 6"
        />
      </div>
    </main>
  );
}
