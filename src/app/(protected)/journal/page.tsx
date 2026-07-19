import type { Metadata } from "next";
import Link from "next/link";

import { composeAppServices } from "@/application/services";
import { cardClasses } from "@/components/ui/form-styles";
import { createSupabaseServerClient } from "@/infrastructure/auth";

export const metadata: Metadata = {
  title: "Decision Journal — Arbor Lyme Capital",
};

export default async function JournalPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { journalService, companyService } = composeAppServices(supabase);
  const [entries, companies] = await Promise.all([
    journalService.listAllEntries(user!.id),
    companyService.listCompanies(user!.id),
  ]);
  const companyById = new Map(companies.map((company) => [company.id, company]));

  const openEntries = entries.filter((entry) => entry.status === "open");
  const closedEntries = entries.filter((entry) => entry.status === "closed");

  return (
    <main id="main-content" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
        Decision Journal
      </h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        Every open and closed position across every company, in one place. Open a company&apos;s own
        Journal tab to record a new entry or close an existing one.
      </p>

      {entries.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-neutral-300 p-8 text-center dark:border-neutral-700">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            No journal entries yet. Open one from a company&apos;s Journal tab.
          </p>
        </div>
      ) : (
        <>
          <h2 className="mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Open positions ({openEntries.length})
          </h2>
          {openEntries.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              No open positions.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {openEntries.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/companies/${entry.companyId}/journal`}
                  className={`${cardClasses} block hover:border-neutral-400 dark:hover:border-neutral-600`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {companyById.get(entry.companyId)?.name ?? entry.companyId}
                    </span>
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">
                      Opened {new Date(entry.purchaseDate).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    Purchase price {entry.purchasePrice} · Conviction{" "}
                    {(entry.convictionAtPurchase * 100).toFixed(0)}%
                  </p>
                </Link>
              ))}
            </div>
          )}

          {closedEntries.length > 0 ? (
            <>
              <h2 className="mt-8 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Closed positions ({closedEntries.length})
              </h2>
              <div className="mt-3 space-y-3">
                {closedEntries.map((entry) => (
                  <Link
                    key={entry.id}
                    href={`/companies/${entry.companyId}/journal`}
                    className={`${cardClasses} block hover:border-neutral-400 dark:hover:border-neutral-600`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {companyById.get(entry.companyId)?.name ?? entry.companyId}
                      </span>
                      <span className="text-sm text-neutral-600 dark:text-neutral-400">
                        {new Date(entry.purchaseDate).toLocaleDateString()} →{" "}
                        {entry.saleDate ? new Date(entry.saleDate).toLocaleDateString() : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                      {entry.saleReason}
                    </p>
                  </Link>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
