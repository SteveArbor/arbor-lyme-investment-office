import type { Metadata } from "next";

import { composeAppServices } from "@/application/services";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { THESIS_STATUS_LABELS } from "../labels";
import { ThesisForm } from "./thesis-form";

export const metadata: Metadata = {
  title: "Thesis — Arbor Lyme Capital",
};

export default async function ThesisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { thesisService } = composeAppServices(supabase);
  const thesis = await thesisService.getOrCreateThesis(user!.id, id);

  return (
    <div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Overall status is calculated automatically from the statements below — it is never set
        directly. Current status:{" "}
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {THESIS_STATUS_LABELS[thesis.overallStatus]}
        </span>
        .
      </p>
      <div className="mt-6">
        <ThesisForm companyId={id} statements={thesis.statements} />
      </div>
    </div>
  );
}
