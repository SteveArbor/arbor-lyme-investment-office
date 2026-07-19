import type { ReactNode } from "react";

import { createSupabaseServerClient } from "@/infrastructure/auth";

import { CompanySubNav } from "./company-sub-nav";
import { getCompanyOrNotFound } from "./get-company-or-not-found";

export default async function CompanyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const company = await getCompanyOrNotFound(user!.id, id);

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          {company.name}
        </h1>
      </div>
      <div className="mt-4">
        <CompanySubNav companyId={id} />
      </div>
      <div className="mt-6">{children}</div>
    </main>
  );
}
