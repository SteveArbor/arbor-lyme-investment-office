import type { Metadata } from "next";
import Link from "next/link";

import { buildCompanyMonitoringSnapshot, composeAppServices } from "@/application/services";
import { cardClasses } from "@/components/ui/form-styles";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { GenerateRatingForm } from "./generate-rating-form";
import { getCompanyOrNotFound } from "./get-company-or-not-found";
import { RATING_LABELS, THESIS_STATUS_LABELS } from "./labels";

export const metadata: Metadata = {
  title: "Company overview — Arbor Lyme Capital",
};

export default async function CompanyOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const services = composeAppServices(supabase);
  const [company, snapshot] = await Promise.all([
    getCompanyOrNotFound(user!.id, id),
    buildCompanyMonitoringSnapshot(services, user!.id, id),
  ]);

  return (
    <div className="space-y-6">
      <div className={cardClasses}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {company.name} ({company.ticker})
          </h2>
          <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {company.status}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Exchange</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{company.exchange}</dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Sector</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{company.sector}</dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Industry</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{company.industry}</dd>
          </div>
          <div>
            <dt className="text-neutral-500 dark:text-neutral-500">Currency</dt>
            <dd className="text-neutral-900 dark:text-neutral-100">{company.currency}</dd>
          </div>
        </dl>
        {company.profile ? (
          <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">{company.profile}</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={cardClasses}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Investment Rating
          </h3>
          <p className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
            {snapshot.latestRating ? RATING_LABELS[snapshot.latestRating] : "Not rated yet"}
          </p>
          {snapshot.expectedReturn !== null ? (
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
              Expected return: {(snapshot.expectedReturn * 100).toFixed(1)}%
            </p>
          ) : null}
        </div>

        <div className={cardClasses}>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            Thesis & valuation
          </h3>
          <p className="mt-2 text-sm text-neutral-900 dark:text-neutral-100">
            Thesis: {THESIS_STATUS_LABELS[snapshot.thesisStatus]}
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            Fair value: {snapshot.blendedFairValue.toFixed(2)} · Required margin of safety:{" "}
            {(snapshot.marginOfSafety * 100).toFixed(0)}%
          </p>
          {snapshot.openJournalEntry ? (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Open journal entry since{" "}
              {new Date(snapshot.openJournalEntry.purchaseDate).toLocaleDateString()} — see{" "}
              <Link href={`/companies/${id}/journal`} className="underline">
                Journal
              </Link>
              .
            </p>
          ) : null}
        </div>
      </div>

      <div className={cardClasses}>
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Generate an Investment Rating
        </h3>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Deterministic — combines business quality, moat, financial strength, capital allocation,
          growth, and risk with expected return and margin of safety (ADR 0023).
        </p>
        <div className="mt-4">
          <GenerateRatingForm companyId={id} />
        </div>
      </div>
    </div>
  );
}
