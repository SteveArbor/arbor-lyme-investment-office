"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { getRequestContext } from "@/application/services";
import { ValidationError } from "@/domain/shared";

export interface UpdateSettingsFormState {
  error: string | null;
  success: boolean;
}

export async function updateSettingsAction(
  _prevState: UpdateSettingsFormState,
  formData: FormData
): Promise<UpdateSettingsFormState> {
  const context = await getRequestContext();
  if (!context) {
    // Should be unreachable — (protected)/layout.tsx already guards this
    // route — but the action is a valid entry point in its own right and
    // must not assume the layout ran first.
    return { error: "You must be signed in.", success: false };
  }
  const { user, services } = context;

  const rawMonthlyTarget = formData.get("monthlyIncomeTarget");
  const rawSecondaryTarget = formData.get("secondaryMonthlyIncomeTarget");

  const input = {
    baseCurrency: formData.get("baseCurrency"),
    timeZone: formData.get("timeZone"),
    appearance: formData.get("appearance"),
    monthlyIncomeTarget: rawMonthlyTarget === null ? undefined : Number(rawMonthlyTarget),
    secondaryMonthlyIncomeTarget:
      rawSecondaryTarget === null ? undefined : Number(rawSecondaryTarget),
  };

  try {
    const { event } = await services.settingsService.updateSettings(user.id, input, randomUUID());
    await services.eventBus.publish(event);
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: "Please check the highlighted fields and try again.", success: false };
    }
    return { error: "Something went wrong. Please try again.", success: false };
  }

  revalidatePath("/settings");
  return { error: null, success: true };
}
