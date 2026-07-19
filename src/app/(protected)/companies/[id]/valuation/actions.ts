"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { composeAppServices } from "@/application/services";
import { ValidationError } from "@/domain/shared";
import { createSupabaseServerClient } from "@/infrastructure/auth";

export interface ActionFormState {
  error: string | null;
  success: boolean;
}

function scenarioFromForm(formData: FormData, prefix: string) {
  return {
    epsAssumption: Number(formData.get(`${prefix}.epsAssumption`)),
    growthRateAssumption: Number(formData.get(`${prefix}.growthRateAssumption`)),
    terminalMultiple: Number(formData.get(`${prefix}.terminalMultiple`)),
    discountRate: Number(formData.get(`${prefix}.discountRate`)),
    probability: Number(formData.get(`${prefix}.probability`)),
  };
}

export async function updateValuationAction(
  companyId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in.", success: false };

  const { valuationService, eventBus } = composeAppServices(supabase);

  const input = {
    projectionYears: Number(formData.get("projectionYears")),
    requiredReturn: Number(formData.get("requiredReturn")),
    marginOfSafety: Number(formData.get("marginOfSafety")),
    bear: scenarioFromForm(formData, "bear"),
    base: scenarioFromForm(formData, "base"),
    bull: scenarioFromForm(formData, "bull"),
  };

  try {
    const { event } = await valuationService.updateValuation(
      user.id,
      companyId,
      input,
      user.id,
      randomUUID()
    );
    await eventBus.publish(event);
  } catch (error) {
    if (error instanceof ValidationError) {
      return {
        error: Object.values(error.fieldErrors).flat()[0] ?? "Please check the highlighted fields.",
        success: false,
      };
    }
    return { error: "Something went wrong. Please try again.", success: false };
  }

  revalidatePath(`/companies/${companyId}/valuation`);
  return { error: null, success: true };
}
