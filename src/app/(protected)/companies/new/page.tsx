import type { Metadata } from "next";

import { CompanyForm } from "../company-form";

export const metadata: Metadata = {
  title: "Add company — Arbor Lyme Capital",
};

export default function NewCompanyPage() {
  return (
    <main id="main-content" className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">Add company</h1>
      <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
        The anchor entity every later research, thesis, valuation, and rating references.
      </p>
      <div className="mt-6">
        <CompanyForm />
      </div>
    </main>
  );
}
