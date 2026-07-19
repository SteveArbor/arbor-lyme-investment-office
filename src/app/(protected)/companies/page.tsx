import type { Metadata } from "next";
import Link from "next/link";

import { composeAppServices } from "@/application/services";
import { primaryButtonClasses } from "@/components/ui/form-styles";
import { createSupabaseServerClient } from "@/infrastructure/auth";

export const metadata: Metadata = {
  title: "Companies — Arbor Lyme Capital",
};

const STATUS_LABELS: Record<string, string> = {
  researching: "Researching",
  monitoring: "Monitoring",
  holding: "Holding",
  passed: "Passed",
  archived: "Archived",
};

export default async function CompaniesPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { companyService } = composeAppServices(supabase);
  const companies = await companyService.listCompanies(user!.id);

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Companies</h1>
        <Link href="/companies/new" className={primaryButtonClasses}>
          Add company
        </Link>
      </div>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        The anchor entity for research, thesis, valuation, an Investment Rating, and any position.
      </p>

      {companies.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            No companies tracked yet. Add the first one to begin research.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full min-w-max text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-medium tracking-wide text-neutral-600 uppercase dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Ticker</th>
                <th className="px-4 py-3">Sector</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Watchlist</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {companies.map((company) => (
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
                    {company.ticker}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {company.sector}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {STATUS_LABELS[company.status] ?? company.status}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {company.watchlist ? "Yes" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
