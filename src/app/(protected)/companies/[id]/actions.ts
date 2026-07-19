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

function fieldError(error: unknown): ActionFormState {
  if (error instanceof ValidationError) {
    return {
      error: Object.values(error.fieldErrors).flat()[0] ?? "Please check the highlighted fields.",
      success: false,
    };
  }
  return { error: "Something went wrong. Please try again.", success: false };
}

export async function generateRatingAction(
  companyId: string,
  _prevState: ActionFormState,
  formData: FormData
): Promise<ActionFormState> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in.", success: false };

  const { decisionService, eventBus } = composeAppServices(supabase);

  const input = {
    companyId,
    businessQuality: Number(formData.get("businessQuality")),
    economicMoat: Number(formData.get("economicMoat")),
    financialStrength: Number(formData.get("financialStrength")),
    capitalAllocation: Number(formData.get("capitalAllocation")),
    growth: Number(formData.get("growth")),
    riskLevel: Number(formData.get("riskLevel")),
    expectedReturn: Number(formData.get("expectedReturn")),
    marginOfSafety: Number(formData.get("marginOfSafety")),
  };

  try {
    const { event } = await decisionService.generateRating(user.id, input, user.id, randomUUID());
    await eventBus.publish(event);
  } catch (error) {
    return fieldError(error);
  }

  revalidatePath(`/companies/${companyId}`);
  return { error: null, success: true };
}
