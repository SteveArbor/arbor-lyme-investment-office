import type { Metadata } from "next";
import Link from "next/link";

import { composeAppServices } from "@/application/services";
import { inputClasses, labelClasses, primaryButtonClasses } from "@/components/ui/form-styles";
import {
  clickableCellLinkClasses,
  clickableRowClasses,
  tableBodyClasses,
  tableClasses,
  tableContainerClasses,
  TableEmptyState,
  tableHeadClasses,
} from "@/components/ui/table";
import { COMPANY_STATUS_OPTIONS, type CompanyStatus } from "@/domain/company";
import { createSupabaseServerClient } from "@/infrastructure/auth";

export const metadata: Metadata = {
  title: "Companies — Arbor Lyme Capital",
};

const STATUS_LABELS: Record<CompanyStatus, string> = {
  researching: "Researching",
  monitoring: "Monitoring",
  holding: "Holding",
  passed: "Passed",
  archived: "Archived",
};

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { companyService } = composeAppServices(supabase);
  const allCompanies = await companyService.listCompanies(user!.id);

  const search = query.q?.trim().toLowerCase() ?? "";
  const status =
    query.status && (COMPANY_STATUS_OPTIONS as readonly string[]).includes(query.status)
      ? (query.status as CompanyStatus)
      : undefined;

  // Companies lists are small enough (dozens, not thousands) that in-memory
  // filtering here is simpler and just as fast as a round trip — no
  // premature query-layer filtering for a dataset this size.
  const companies = allCompanies
    .filter((company) => !status || company.status === status)
    .filter(
      (company) =>
        !search ||
        company.name.toLowerCase().includes(search) ||
        company.ticker.toLowerCase().includes(search)
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasFilters = Boolean(search || status);

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

      {allCompanies.length > 0 ? (
        <form
          method="get"
          className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-3 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div>
            <label htmlFor="q" className={labelClasses}>
              Search
            </label>
            <input
              id="q"
              name="q"
              type="search"
              placeholder="Name or ticker"
              defaultValue={query.q ?? ""}
              className={inputClasses}
            />
          </div>
          <div>
            <label htmlFor="status" className={labelClasses}>
              Status
            </label>
            <select id="status" name="status" defaultValue={status ?? ""} className={inputClasses}>
              <option value="">All statuses</option>
              {COMPANY_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {STATUS_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-3">
            <button type="submit" className={`${inputClasses.replace("mt-1", "")} w-auto px-4`}>
              Apply
            </button>
            {hasFilters ? (
              <Link
                href="/companies"
                className="text-sm text-neutral-600 hover:underline dark:text-neutral-400"
              >
                Clear filters
              </Link>
            ) : null}
          </div>
        </form>
      ) : null}

      {allCompanies.length === 0 ? (
        <div className="mt-8">
          <TableEmptyState message="No companies tracked yet. Add the first one to begin research." />
        </div>
      ) : companies.length === 0 ? (
        <div className="mt-4">
          <TableEmptyState message="No companies match these filters." />
        </div>
      ) : (
        <div className={`mt-4 ${tableContainerClasses}`}>
          <table className={tableClasses}>
            <thead className={tableHeadClasses}>
              <tr>
                <th scope="col" className="px-4 py-3">
                  Name
                </th>
                <th scope="col" className="px-4 py-3">
                  Ticker
                </th>
                <th scope="col" className="px-4 py-3">
                  Sector
                </th>
                <th scope="col" className="px-4 py-3">
                  Status
                </th>
                <th scope="col" className="px-4 py-3">
                  Watchlist
                </th>
              </tr>
            </thead>
            <tbody className={tableBodyClasses}>
              {companies.map((company) => (
                <tr key={company.id} className={clickableRowClasses}>
                  <td className="p-0">
                    <Link
                      href={`/companies/${company.id}`}
                      className={`${clickableCellLinkClasses} font-medium text-neutral-900 dark:text-neutral-100`}
                    >
                      {company.name}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/companies/${company.id}`}
                      className={`${clickableCellLinkClasses} text-neutral-600 dark:text-neutral-400`}
                    >
                      {company.ticker}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/companies/${company.id}`}
                      className={`${clickableCellLinkClasses} text-neutral-600 dark:text-neutral-400`}
                    >
                      {company.sector}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/companies/${company.id}`}
                      className={`${clickableCellLinkClasses} text-neutral-600 dark:text-neutral-400`}
                    >
                      {STATUS_LABELS[company.status] ?? company.status}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/companies/${company.id}`}
                      className={`${clickableCellLinkClasses} text-neutral-600 dark:text-neutral-400`}
                    >
                      {company.watchlist ? "Yes" : ""}
                    </Link>
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
