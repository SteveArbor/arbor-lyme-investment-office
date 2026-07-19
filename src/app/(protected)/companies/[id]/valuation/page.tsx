import type { Metadata } from "next";

import { composeAppServices } from "@/application/services";
import { createSupabaseServerClient } from "@/infrastructure/auth";

import { ValuationForm } from "./valuation-form";

export const metadata: Metadata = {
  title: "Valuation — Arbor Lyme Capital",
};

export default async function ValuationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { valuationService } = composeAppServices(supabase);
  const valuation = await valuationService.getOrCreateValuation(user!.id, id);

  return (
    <div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Bear/base/bull scenario valuation. Fair value is always recalculated server-side from these
        assumptions — never entered directly. Blended fair value:{" "}
        <span className="font-medium text-neutral-900 dark:text-neutral-100">
          {valuation.blendedFairValue.toFixed(2)}
        </span>
      </p>
      <div className="mt-6">
        <ValuationForm companyId={id} valuation={valuation} />
      </div>
    </div>
  );
}
