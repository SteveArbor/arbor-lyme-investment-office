import type { Metadata } from "next";

import { composeAppServices } from "@/application/services";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { ResearchForm } from "./research-form";

export const metadata: Metadata = {
  title: "Research — Arbor Lyme Capital",
};

export default async function ResearchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { researchService } = composeAppServices(supabase);
  const research = await researchService.getOrCreateResearch(user!.id, id);

  return (
    <div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Each section is independently editable. Every update preserves the previous version.
      </p>
      <div className="mt-6">
        <ResearchForm companyId={id} research={research} />
      </div>
    </div>
  );
}
