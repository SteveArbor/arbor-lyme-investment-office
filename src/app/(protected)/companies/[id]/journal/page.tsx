import type { Metadata } from "next";

import { composeAppServices } from "@/application/services";
import { cardClasses } from "@/components/ui/form-styles";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { CloseEntryForm } from "./close-entry-form";
import { OpenEntryForm } from "./open-entry-form";

export const metadata: Metadata = {
  title: "Decision journal — Arbor Lyme Capital",
};

export default async function JournalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { journalService, portfolioService } = composeAppServices(supabase);
  const [entries, portfolios] = await Promise.all([
    journalService.listEntriesForCompany(user!.id, id),
    portfolioService.listPortfolios(user!.id),
  ]);
  const openEntry = entries.find((entry) => entry.status === "open") ?? null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Captures the reasoning behind a position at the moment it is opened. Purchase-time fields
        are never edited — only the sale fields are added later, once.
      </p>

      {openEntry ? (
        <div className={cardClasses}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Open position — opened {new Date(openEntry.purchaseDate).toLocaleDateString()}
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-neutral-500">Purchase price</dt>
              <dd className="text-neutral-900 dark:text-neutral-100">{openEntry.purchasePrice}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Fair value</dt>
              <dd className="text-neutral-900 dark:text-neutral-100">
                {openEntry.fairValueAtPurchase}
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500">Position size</dt>
              <dd className="text-neutral-900 dark:text-neutral-100">{openEntry.positionSize}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Conviction</dt>
              <dd className="text-neutral-900 dark:text-neutral-100">
                {(openEntry.convictionAtPurchase * 100).toFixed(0)}%
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-medium">Thesis:</span> {openEntry.thesisSummary}
          </p>
          <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-medium">Risks:</span> {openEntry.risks}
          </p>
          <p className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
            <span className="font-medium">Invalidation conditions:</span>{" "}
            {openEntry.invalidationConditions}
          </p>
          <div className="mt-6 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Close this entry
            </h4>
            <div className="mt-3">
              <CloseEntryForm companyId={id} entryId={openEntry.id} />
            </div>
          </div>
        </div>
      ) : portfolios.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Create a portfolio first — a journal entry belongs to a portfolio position.
        </p>
      ) : (
        <div className={cardClasses}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Open a new journal entry
          </h3>
          <div className="mt-3">
            <OpenEntryForm companyId={id} portfolios={portfolios} />
          </div>
        </div>
      )}

      {entries.filter((entry) => entry.status === "closed").length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Closed entries
          </h3>
          <div className="mt-3 space-y-3">
            {entries
              .filter((entry) => entry.status === "closed")
              .map((entry) => (
                <div key={entry.id} className={cardClasses}>
                  <p className="text-sm text-neutral-900 dark:text-neutral-100">
                    {new Date(entry.purchaseDate).toLocaleDateString()} →{" "}
                    {entry.saleDate ? new Date(entry.saleDate).toLocaleDateString() : ""}
                  </p>
                  <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                    Sale reason: {entry.saleReason}
                  </p>
                  {entry.lessonsLearned ? (
                    <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                      Lessons learned: {entry.lessonsLearned}
                    </p>
                  ) : null}
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
