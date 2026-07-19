"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getRequestContext } from "@/application/services";
import { ValidationError } from "@/domain/shared";

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
  const context = await getRequestContext();
  if (!context) return { error: "You must be signed in.", success: false };
  const { user, services } = context;

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
    const { event } = await services.decisionService.generateRating(
      user.id,
      input,
      user.id,
      randomUUID()
    );
    await services.eventBus.publish(event);
  } catch (error) {
    return fieldError(error);
  }

  revalidatePath(`/companies/${companyId}`);
  return { error: null, success: true };
}
