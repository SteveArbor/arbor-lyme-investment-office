import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { composeAppServices } from "@/application/services";
import { NotFoundError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { CompanySubNav } from "./company-sub-nav";

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

  const { companyService } = composeAppServices(supabase);

  let companyName: string;
  try {
    const company = await companyService.getCompany(user!.id, id);
    companyName = company.name;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <main id="main-content" className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
          {companyName}
        </h1>
      </div>
      <div className="mt-4">
        <CompanySubNav companyId={id} />
      </div>
      <div className="mt-6">{children}</div>
    </main>
  );
}
